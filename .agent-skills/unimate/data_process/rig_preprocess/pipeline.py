"""Turn one rigged 3D asset, with or without animation, into training data.

One command runs, for a single asset, the stages the dataset pipeline runs
over a whole dataset, calling the same code so the result is what that
pipeline would have produced. Every stage writes into ``<output_dir>/work/``
in the dataset layout:

  1. export     the profile's stage-1 exporter (``rig_preprocess.export``);
                an asset without animation becomes one rest-pose clip. A
                skeleton with several roots is refused.
  2. patches    ``--annotate dataset``: the dataset's root-offset and
                rest-orientation fixes, filter / trim / activity lists and
                captions for this asset. ``--rest_rotation``: the same
                rest-orientation fix with a hand-given turn.
  3. rig GLB    ``export/rigs/<name>.glb``, as ``--save_glb`` builds it.
  4. annotate   cleaned joint names and the facing pair
                (``rig_preprocess.annotate``, or a reviewed ``--annotation``
                file), plus the upside-down check. ``--review`` stops here and
                writes ``annotation.json``, ``annotation_preview.png`` and
                ``REVIEW.md`` (``rig_preprocess.review``) instead of the
                outputs below.
  5. features   stage 4 (``feature_extraction.extract_features``) with the
                profile's arguments: ``features/cond.npy`` and ``motions/``.
                An asset whose clips are all filtered (or that has none) still
                gets its cond entry, built from its rest pose.
  6. canonical  ``canonical_assets/<name>.glb`` (``canonical_assets.bake_canonical_assets``).
                An asset without a mesh (or whose GLB cannot be built) still
                gets its cond; ``summary.json`` says why there is no GLB.
  7. deliver    the outputs below, then ``work/`` is removed (unless
                ``--keep_intermediate``).

Outputs in ``--output_dir``::

    cond.npy     {name: cond}, the stage-4 topology condition of the asset
    <name>.glb   the canonical asset: rebuilt to the cond's T-pose, joint order
                 stored in the file (what the model's motions drive);
                 ``<name>.fbx`` beside it with ``--formats glb,fbx``
    preview.png  the canonical T-pose with its facing pair, forward direction
                 and cleaned joint labels (``rig_preprocess/preview.py``)
    motions/     with ``--save_clips``: the asset's stage-4 feature clips, the
                 ground truth sampling can hold (in-betweening, motion editing)
    summary.json the asset name, profile, stats dataset, annotation sources,
                 face pair, counts, and notes on what the model cannot
                 reproduce (README.md lists every field)

The output directory is an *asset*: ``python -m unimate.inference.sample
--asset <output_dir>`` samples on it, and the samples' manifest drives
``<name>.glb`` (``scripts/run_animate_motion.sh <samples_dir>``).

``--keep_intermediate`` keeps ``work/`` (``export/``: NPZs, ``rigs/<name>.glb``,
the stage-3 JSONs; ``features/``: ``cond.npy``, the training clips
``motions/*.npz``; ``canonical_assets/``).

Run it through the package CLI (``python -m data_process.rig_preprocess run``,
see ``cli.py``) or call :func:`preprocess`.
"""

import glob
import json
import os
import re
import shlex
import shutil

from pathlib import Path

import numpy as np
from loguru import logger

from data_process.feature_extraction import extract_features
from data_process.rig_preprocess.annotate import annotate
from data_process.rig_preprocess.export import (
    asset_key,
    build_processed_glb,
    export_animated,
    export_static,
)
from data_process.rig_preprocess.profiles import AUTO, PROFILES, pick_profile
from data_process.rig_preprocess.review import (
    ANNOTATION_FILE,
    REVIEW_FILE,
    REVIEW_PREVIEW,
    build_annotation,
    load_annotation,
    read_annotation,
    write_review,
)
from data_process.tools import patch_annotations
from data_process.utils.kinematics import rest_global

# Per-asset sidecars of a dataset export that stage 4 reads (copied whole,
# stage 4 looks up only this asset's clips) and the caption files (copied
# down to this asset's clips).
LIST_SIDECARS = ('filtered_clips.txt', 'clip_trims.txt', 'activity_keep.txt',
                 'filtered_objects.txt')
CAPTION_SIDECARS = ('motion_captions.json', 'motion_captions_generic.json',
                    'motion_captions_detail.json')
# The dataset-layout intermediates, under <output_dir>/<WORK_DIR>/.
WORK_DIR = 'work'
SUBDIRS = ('export', 'features', 'canonical_assets')
# Characters an asset name cannot hold: '-' separates the object type from the
# clip id, '/' a directory, and glob patterns ('{name}-*.npz') would read
# [ ] * ? as wildcards and find none of the asset's clips.
_GLOB_CHARS = re.compile(r'[\[\]*?]')
_BAD_NAME = re.compile(r'[-/\\\[\]*?]')
# Joints a model can take: the padded joint width of the released UniML3D
# models (dataset.max_joints 70, +1 for joint addition); a run's own config.json
# (--exp_dir) gives its exact width.
MODEL_MAX_JOINTS = 71
# Stage 4 keeps only the root's animated translation; a clip whose other joints
# translate by more than this share of the skeleton extent loses visible motion.
TRANSLATION_NOTE_TOL = 0.01
CANONICAL_FORMATS = ('glb', 'fbx')
# Clean-label words of the joints the upside-down check compares.
_HEAD_WORDS = ('Head',)
_FOOT_WORDS = ('Foot', 'Toe')
# Feet this far above the head (share of the rest-pose extent) mean the rest
# pose was authored upside down.
UPSIDE_DOWN_TOL = 0.1


def parse_rest_rotation(spec):
    """Quaternion (w, x, y, z) of ``--rest_rotation``: comma-separated axis turns
    applied in order, e.g. ``x180`` (upside down), ``x90`` / ``x-90`` (lying on
    its back / front), ``x90,y180``. Angles in degrees, about the export's
    Y-up axes."""
    q = np.array([1.0, 0.0, 0.0, 0.0])
    for part in [p.strip().lower() for p in spec.split(',') if p.strip()]:
        m = re.fullmatch(r'([xyz])\s*([+-]?\d+(?:\.\d+)?)', part)
        if not m:
            raise ValueError(f"--rest_rotation {spec!r}: expected turns like 'x180' or 'x90,y180'")
        half = np.radians(float(m.group(2))) / 2
        axis = np.eye(3)['xyz'.index(m.group(1))]
        turn = np.concatenate([[np.cos(half)], np.sin(half) * axis])
        w1, v1, w2, v2 = turn[0], turn[1:], q[0], q[1:]
        q = np.concatenate([[w1 * w2 - v1 @ v2], w1 * v2 + w2 * v1 + np.cross(v1, v2)])
    return q / np.linalg.norm(q)


def upside_down_note(clean, rest_pos):
    """A note when the rest pose stands on its head (the mean height of the
    Foot / Toe joints above that of the Head joints), else None."""
    pos = np.asarray(rest_pos, dtype=np.float64)
    head = [i for i, n in enumerate(clean) if any(w in n.split() for w in _HEAD_WORDS)
            and not n.endswith(' End')]
    feet = [i for i, n in enumerate(clean) if any(w in n.split() for w in _FOOT_WORDS)]
    if not head or not feet:
        return None
    extent = float(np.ptp(pos, axis=0).max()) or 1.0
    if pos[feet, 1].mean() - pos[head, 1].mean() > UPSIDE_DOWN_TOL * extent:
        return ("the rest pose looks upside down (its feet are above its head); check "
                "preview.png and rerun with --rest_rotation x180 (or x90 / x-90 for a "
                "pose lying on its back / front)")
    return None


def _asset_name(prof, inputs, name):
    """The asset's name: *name*, else the exporter's name for the file with
    glob characters replaced. Raises on a name stage 1 / stage 4 cannot use."""
    key = asset_key(prof, inputs)
    if _GLOB_CHARS.search(key):
        if prof.exporter == 'truebones':
            raise ValueError(f"species name {key!r} holds one of '[]*?'; rename the clip files")
        safe = _GLOB_CHARS.sub('_', key)
        logger.info(f"asset name {key!r} -> {safe!r} ('[]*?' would act as glob wildcards)")
        key = safe
    name = name or key
    if not name or _BAD_NAME.search(name):
        raise ValueError(f"asset name {name!r} must be non-empty and hold none of '-/\\[]*?'")
    return name, key


def model_joint_limit(exp_dir=None):
    """``(limit, source)``: the joint count a model takes, from a run directory's
    config.json (its padded ``dataset.max_joints``), else ``MODEL_MAX_JOINTS``."""
    if exp_dir:
        path = os.path.join(exp_dir, 'config.json')
        with open(path) as f:
            return int(json.load(f)['dataset']['max_joints']), path
    return MODEL_MAX_JOINTS, 'released UniML3D models'


def _save_json(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2)


def _copy_dataset_sidecars(name, dataset_export_dir, export_dir):
    copied = []
    for fname in LIST_SIDECARS:
        src = os.path.join(dataset_export_dir, fname)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(export_dir, fname))
            copied.append(fname)
    for fname in CAPTION_SIDECARS:
        src = os.path.join(dataset_export_dir, fname)
        if os.path.isfile(src):
            with open(src) as f:
                caps = json.load(f)
            _save_json(os.path.join(export_dir, fname),
                       {k: v for k, v in caps.items() if k.split('-', 1)[0] == name})
            copied.append(fname)
    return copied


def _dropped_translation(export_dir, name):
    """Largest animated translation of a non-root joint away from its rest
    offset over the asset's export clips, relative to the rest-pose extent:
    ``(share, clip, joint)``. Stage 4 keeps rotations and the root's path
    only, so this motion (sliding joints, stretching bones) is lost."""
    worst = (0.0, None, None)
    for path in sorted(Path(export_dir, 'motions').glob(f'{glob.escape(name)}-*.npz')):
        with np.load(path, allow_pickle=True) as npz:
            rest = np.asarray(npz['rest_local_pos'], dtype=np.float64)
            anim = np.asarray(npz['anim_local_pos'], dtype=np.float64)
            extent = float(np.ptp(rest_global(npz), axis=0).max()) or 1.0
            if anim.shape[1] < 2:
                continue
            dev = np.linalg.norm(anim[:, 1:] - rest[None, 1:], axis=-1).max(axis=0) / extent
            j = int(np.argmax(dev))
            if dev[j] > worst[0]:
                worst = (float(dev[j]), path.stem, str(npz['names'][j + 1]))
    return worst


def _is_own_summary(path):
    """Whether *path* is a summary.json this package wrote (not, e.g., an
    export directory's merged summary)."""
    try:
        with open(path) as f:
            info = json.load(f)
    except (OSError, ValueError):
        return False
    return isinstance(info, dict) and {'name', 'profile', 'inputs'} <= set(info)


def _summary_field(path, key):
    """Field *key* of an earlier output's summary.json (``stage`` is 'review'
    for a ``--review`` run), or None."""
    if not _is_own_summary(path):
        return None
    with open(path) as f:
        return json.load(f).get(key)


def _unused_path(path):
    """*path*, or *path* with the first free number appended."""
    n, candidate = 1, path
    while os.path.exists(candidate):
        n += 1
        candidate = f'{path}{n}'
    return candidate


def _display_path(path):
    """*path* relative to the working directory when it lies below it (as the
    other summary paths are), else absolute."""
    rel = os.path.relpath(path)
    return path if rel == os.pardir or rel.startswith(os.pardir + os.sep) else rel


def _resume_command(inputs, output_dir, profile, name, key, rest_rotation, annotation_path,
                    options):
    """The command that continues a ``--review`` run from its annotation, with
    the run's other non-default options (*options*: flag -> value, True for a
    switch)."""
    def q(arg):
        return shlex.quote(os.fspath(arg))
    cmd = ['python -m data_process.rig_preprocess run --input', *map(q, inputs),
           '--output_dir', q(output_dir), '--profile', profile]
    if name != key:
        cmd += ['--name', q(name)]
    if rest_rotation:
        cmd += ['--rest_rotation', q(rest_rotation)]
    for flag, value in options.items():
        if value is True:
            cmd.append(flag)
        elif value and value is not False and not (flag == '--formats' and value == 'glb'):
            cmd += [flag, q(str(value))]
    cmd += ['--annotation', q(annotation_path)]
    return ' '.join(cmd)


def _stop_for_review(summary, notes, output_dir, work, keep_intermediate, names, parents,
                     rest_pos, clean, face, annotation_path, resume):
    """Write the review files and the review-stage summary.json; no cond yet."""
    mode = summary.get('annotate_names') or summary['annotate']
    data = build_annotation(summary['name'], names, parents, rest_pos, clean, face, mode=mode,
                            notes=notes)
    write_review(output_dir, data, names, parents, rest_pos, face, resume)
    summary.update({'stage': 'review', 'review': {
        'annotation': annotation_path, 'flagged_joints': data['n_flagged'],
        'face_pair_flagged': data['face_pair']['check'], 'resume': resume}})
    summary['notes'] = notes
    if not keep_intermediate:
        shutil.rmtree(work)
        summary['rig_glb'] = None
    _save_json(os.path.join(output_dir, 'summary.json'), summary)
    logger.info(f"'{summary['name']}': annotation ready for review, {data['n_flagged']} of "
                f"{len(names)} joints flagged"
                + (", the facing pair flagged" if data['face_pair']['check'] else '')
                + f". Read {os.path.join(output_dir, REVIEW_FILE)}, edit {annotation_path}, "
                f"then continue:\n  {resume}")
    return summary


def _root_count(npz_path):
    with np.load(npz_path, allow_pickle=True) as npz:
        return int((np.asarray(npz['parents']) < 0).sum())


def _cond_entry(features_dir, name):
    """This asset's cond: from cond.npy, else from stage 4's cache entry, which
    holds it even when every clip was filtered (cond.npy lists only objects
    with clips)."""
    cond = np.load(os.path.join(features_dir, 'cond.npy'), allow_pickle=True).item()
    if name in cond:
        return cond[name], True
    part = os.path.join(features_dir, 'cond_parts', f'{name}.npy')
    if os.path.isfile(part):
        entry = np.load(part, allow_pickle=True).item().get('result', {}).get('cond')
        if entry is not None:
            return entry, False
    return None, False


def preprocess(inputs, output_dir, profile=AUTO, annotate_mode='rule', name=None,
               face_r=None, face_l=None, body_axis=False, dataset_export_dir=None,
               patch_dir=None, llm_client=None, llm_options=None, overwrite=False,
               keep_intermediate=False, fps=30, names_mode=None, face_mode=None,
               exp_dir=None, formats=('glb',), save_clips=False, preview=True,
               rest_rotation=None, review=False, annotation=None):
    """Run every stage on one asset; see the module docstring. Returns the summary dict.
    *profile* ``auto`` is :func:`profiles.pick_profile`; *names_mode* /
    *face_mode* ('rule' / 'llm', default *annotate_mode*) pick the joint-name and
    face-pair sources separately outside ``dataset`` mode; *exp_dir* a training
    run whose joint width the asset is checked against; *formats* the canonical
    asset's files (``glb`` always); *save_clips* keeps the feature clips in
    ``<output_dir>/motions/``; *preview* writes ``preview.png``; *rest_rotation*
    (:func:`parse_rest_rotation`) stands up a rest pose authored lying down or
    upside down, as the dataset's rest-orientation patches do. *review* stops
    after the annotation and writes ``annotation.json``, ``annotation_preview.png``
    and ``REVIEW.md`` for a person, an LLM or an agent to check
    (``rig_preprocess/review.py``); *annotation* takes the joint labels and the
    facing pair from such a file, edited, instead of annotating."""
    requested_profile = profile
    if profile == AUTO:
        profile = pick_profile(inputs, dataset_export_dir if annotate_mode == 'dataset' else None)
        logger.info(f"profile: {profile} (auto)")
    if profile not in PROFILES:
        raise ValueError(f"unknown profile {profile!r}; one of {sorted(PROFILES)} or {AUTO!r}")
    formats = tuple(dict.fromkeys(('glb',) + tuple(formats)))
    bad = sorted(set(formats) - set(CANONICAL_FORMATS))
    if bad:
        raise ValueError(f"canonical asset formats {bad}: expected a subset of {CANONICAL_FORMATS}")
    prof = PROFILES[profile]
    inputs = [os.fspath(p) for p in inputs]
    for p in inputs:
        if not os.path.isfile(p):
            raise FileNotFoundError(p)
    name, key = _asset_name(prof, inputs, name)
    joint_limit, limit_source = model_joint_limit(exp_dir)
    if annotate_mode == 'dataset' and (names_mode or face_mode):
        raise ValueError("--annotate dataset takes both the names and the face pair from "
                         "the dataset; drop --annotate_names / --annotate_face")
    if annotate_mode == 'dataset' and not (dataset_export_dir and os.path.isfile(
            os.path.join(dataset_export_dir, 'clean_joint_names.json'))):
        raise ValueError(f"--annotate dataset needs a stage-3 dataset export, got "
                         f"{dataset_export_dir!r}")
    rest_quat = parse_rest_rotation(rest_rotation) if rest_rotation else None
    if rest_quat is not None and annotate_mode == 'dataset':
        raise ValueError("--rest_rotation is for unseen assets; --annotate dataset applies the "
                         "dataset's own rest-orientation patch")
    if annotation is not None:
        if annotate_mode != 'rule' or names_mode or face_mode or face_r or face_l or body_axis:
            raise ValueError("--annotation gives the labels and the face pair; drop --annotate / "
                             "--annotate_names / --annotate_face / --face_r / --face_l / "
                             "--body_axis")
        if not os.path.isfile(annotation):
            raise FileNotFoundError(annotation)
        annotation = os.path.abspath(annotation)
        read_annotation(annotation)     # structure, before anything is removed
    if review and annotate_mode == 'dataset':
        raise ValueError("--review checks rule / llm annotation; --annotate dataset already "
                         "takes the dataset's reviewed labels")
    if name != key and (annotate_mode == 'dataset' or prof.exporter == 'truebones'):
        raise ValueError("--name cannot rename an asset annotated from the dataset or a "
                         "Truebones species (named after its clip files)")

    cond_path = os.path.join(output_dir, 'cond.npy')
    asset_paths = {fmt: os.path.join(output_dir, f'{name}.{fmt}') for fmt in CANONICAL_FORMATS}
    glb_path = asset_paths['glb']
    work = os.path.join(output_dir, WORK_DIR)
    summary_path = os.path.join(output_dir, 'summary.json')
    preview_path = os.path.join(output_dir, 'preview.png')
    clips_dir = os.path.join(output_dir, 'motions')
    review_paths = [os.path.join(output_dir, f) for f in (REVIEW_FILE, REVIEW_PREVIEW)]
    annotation_path = os.path.join(output_dir, ANNOTATION_FILE)
    present = [p for p in (cond_path, *asset_paths.values(), work, summary_path, preview_path,
                           clips_dir, *review_paths) if os.path.exists(p)]
    # Only an earlier output (its own summary.json) or an interrupted run's
    # work/ is ever removed: a feature or export directory also holds cond.npy /
    # motions/ / a summary.json of its own.
    if present and not (_is_own_summary(summary_path) or present == [work]):
        raise FileExistsError(
            f"{output_dir} holds {', '.join(os.path.basename(p) for p in present)} but is "
            f"not a rig_preprocess output; choose another --output_dir")
    # A review of this asset is the first half of the job: continuing it
    # (--annotation, or --review again) replaces it without --overwrite.
    review_stage = (_summary_field(summary_path, 'stage') == 'review'
                    and _summary_field(summary_path, 'name') == name)
    continuing = review_stage and bool(annotation or review)
    if present and not (overwrite or continuing):
        if review_stage:
            raise FileExistsError(
                f"{output_dir} holds a review of '{name}': continue with --annotation "
                f"{os.path.join(output_dir, ANNOTATION_FILE)}, or pass --overwrite to redo it")
        raise FileExistsError(f"{present[0]} exists; pass --overwrite to redo the asset")
    # annotation.json may hold a reviewer's edits: it is never removed, and a
    # run that does not read it sets it aside only with --overwrite.
    if os.path.isfile(annotation_path) and not (
            annotation and os.path.samefile(annotation, annotation_path)):
        if not overwrite:
            hint = f"--annotation {annotation_path}" + (
                '' if review_stage or not present else ' --overwrite')
            raise FileExistsError(
                f"{annotation_path} exists and may hold edits this run would not use; continue "
                f"with {hint}, or pass --overwrite to set it aside")
        backup = _unused_path(annotation_path + '.bak')
        shutil.move(annotation_path, backup)
        logger.warning(f"{annotation_path} moved to {backup}")
    # While continuing, the review files and summary stay until the annotation
    # file has loaded, so a rejected edit can be fixed and the command rerun.
    keep_review = continuing and not overwrite
    for p in present:
        if not (keep_review and p in (summary_path, *review_paths)):
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    export_dir, features_dir, canon_dir = (os.path.join(work, sub) for sub in SUBDIRS)
    os.makedirs(os.path.join(export_dir, 'motions'), exist_ok=True)
    summary = {'name': name, 'profile': profile, 'inputs': inputs,
               'annotate': 'file' if annotation else annotate_mode}
    if requested_profile == AUTO:
        summary['profile_auto'] = True
    if annotation:
        summary['annotation'] = _display_path(annotation)
    elif annotate_mode != 'dataset':
        summary['annotate_names'] = names_mode or annotate_mode
        summary['annotate_face'] = face_mode or annotate_mode

    # 1. export
    names = export_animated(prof, inputs, export_dir, name, fps=fps)
    summary['animated'] = names is not None
    if names is None:
        if len(inputs) != 1:
            raise ValueError("no clip was exported from the given files")
        names = export_static(prof, inputs[0], export_dir, name, fps=fps)
    _save_json(os.path.join(export_dir, 'joint_names.json'), {name: names})
    summary['n_joints_export'] = len(names)
    first_clip = sorted(Path(export_dir, 'motions').glob(f'{glob.escape(name)}-*.npz'))[0]
    n_roots = _root_count(first_clip)
    if n_roots > 1:
        raise ValueError(
            f"'{name}': the exported skeleton has {n_roots} root bones. With a mesh the "
            f"exporter keeps the one that deforms it; this asset has none skinned. Give it "
            f"a single root (parent the others under it) or a skinned mesh.")

    # 2. dataset patches and sidecars
    if annotate_mode == 'dataset':
        # The dataset whose cond / canonical GLB this output reproduces (verify's default).
        summary['reference'] = os.path.basename(os.path.normpath(
            os.path.realpath(dataset_export_dir)))
        log = []
        summary['dataset_sidecars'] = _copy_dataset_sidecars(name, dataset_export_dir, export_dir)
        # The patch files are keyed by the dataset reproduced, which can differ
        # from the profile (a GLB of objaverse under the general profile).
        summary['root_offsets_applied'] = patch_annotations.apply_root_offsets(
            summary['reference'], export_dir, patch_dir, False, log)
        summary['rest_orientations_applied'] = patch_annotations.apply_rest_orientations(
            summary['reference'], export_dir, patch_dir, False, log)
        for line in log:
            # the patch files list every rig of the dataset; only this one's lines matter
            if name in line or 'no export NPZ' not in line:
                logger.info(f"[patch] {line}")

    if rest_quat is not None:
        # The dataset's patch mechanism, with the turn given by hand.
        patch_tmp = os.path.join(work, 'patches')
        os.makedirs(patch_tmp, exist_ok=True)
        _save_json(os.path.join(patch_tmp, f'{profile}_rest_orientation.json'),
                   {name: {'quat': [float(v) for v in rest_quat],
                           'reason': f'--rest_rotation {rest_rotation}'}})
        log = []
        patch_annotations.apply_rest_orientations(profile, export_dir, patch_tmp, False, log)
        summary['rest_rotation'] = {'spec': rest_rotation,
                                    'quat': [round(float(v), 6) for v in rest_quat]}
        for line in log:
            logger.info(f"[rest_rotation] {line}")

    # 3. processed rig GLB
    summary['rig_glb'] = build_processed_glb(prof, inputs, export_dir, name, names,
                                             animated=summary['animated'], fps=fps)

    summary['stats_dataset'] = summary.get('reference', profile)
    share, clip, joint = _dropped_translation(export_dir, name)
    summary['dropped_translation'] = {'max_share_of_extent': round(share, 4), 'clip': clip,
                                      'joint': joint}
    notes = []
    if share > TRANSLATION_NOTE_TOL:
        notes.append(f"joint '{joint}' translates by {share:.1%} of the skeleton in "
                     f"'{clip}'; the model keeps rotations and the root path only")
        logger.warning(f"'{name}': {notes[-1]}")

    # 4. annotate
    with np.load(first_clip, allow_pickle=True) as npz:
        rest_pos = rest_global(npz)
        parents = [int(p) for p in npz['parents']]
    if annotation:
        clean, face, notes_ann = load_annotation(annotation, names, rest_pos)
        notes_ann = [line.replace(annotation, _display_path(annotation)) for line in notes_ann]
        for line in notes_ann:
            logger.info(f"[annotate] {line}")
        if not review:
            for p in review_paths:
                if os.path.exists(p):
                    os.remove(p)
    else:
        clean, face, notes_ann = annotate(annotate_mode, profile, name, names, export_dir,
                                          dataset_export_dir=dataset_export_dir, face_r=face_r,
                                          face_l=face_l, body_axis=body_axis,
                                          llm_client=llm_client, llm_options=llm_options,
                                          rest_pos=rest_pos, names_mode=names_mode,
                                          face_mode=face_mode)
    flipped = upside_down_note(clean, rest_pos)
    if flipped:
        notes.append(flipped)
        logger.warning(f"'{name}': {flipped}")
    _save_json(os.path.join(export_dir, 'clean_joint_names.json'), {name: clean})
    _save_json(os.path.join(export_dir, 'face_joint_names.json'), {name: face})
    summary['face_pair'] = face
    summary['annotation_notes'] = notes_ann
    if review:
        return _stop_for_review(summary, notes, output_dir, work, keep_intermediate, names,
                                parents, rest_pos, clean, face, annotation_path,
                                _resume_command(inputs, output_dir, profile, name, key,
                                                rest_rotation, annotation_path, {
                                                    '--formats': ','.join(formats),
                                                    '--save_clips': save_clips,
                                                    '--no_preview': not preview,
                                                    '--keep_intermediate': keep_intermediate,
                                                    '--exp_dir': exp_dir,
                                                    '--fps': fps if fps != 30 else None}))

    # 5. features (stage 4, the profile's arguments)
    args = extract_features.parse_args(
        ['--dataset_type', profile, '--data_dir', export_dir, '--save_dir', features_dir,
         '--no-vis', *prof.stage4_args])
    extract_features.main(args)
    entry, has_clips = _cond_entry(features_dir, name)
    if entry is None:
        raise RuntimeError(f"stage 4 produced no cond for '{name}'; see "
                           f"{features_dir}/extract_errors.log and filtered_clips.json")
    if not has_clips:
        # The rest-pose cond, so the asset can still be driven and conditioned on.
        np.save(os.path.join(features_dir, 'cond.npy'), {name: entry})
    summary['n_joints'] = len(entry['joint_names'])
    summary['model_joint_limit'] = {'max_joints': joint_limit, 'source': limit_source,
                                    'fits': summary['n_joints'] <= joint_limit}
    if not summary['model_joint_limit']['fits']:
        notes.append(f"{summary['n_joints']} joints: more than the {joint_limit} a model "
                     f"takes ({limit_source}); sampling refuses it")
        logger.warning(f"'{name}' has {summary['n_joints']} joints, more than the "
                       f"{joint_limit} a model takes ({limit_source}): sampling will "
                       f"refuse it. Simplify the rig (fewer finger / face / accessory "
                       f"bones) before using it.")
    summary['n_clips'] = len([f for f in os.listdir(os.path.join(features_dir, 'motions'))
                              if f.startswith(f'{name}-')]) \
        if os.path.isdir(os.path.join(features_dir, 'motions')) else 0

    # 6. canonical asset (the cond stands without it: the motion can still be
    # sampled and rendered as a skeleton)
    canon = os.path.join(canon_dir, f'{name}.glb')
    if summary['rig_glb']:
        from data_process.feature_extraction.canonical_assets import bake_canonical_assets
        counts = bake_canonical_assets(export_dir, features_dir, assets_dir=canon_dir,
                                       dataset_type=profile, object_types=[name],
                                       formats=formats)
        if not os.path.isfile(canon):
            note = os.path.join(canon_dir, 'glb_errors', f'{name}.txt')
            reason = open(note).read().strip() if os.path.isfile(note) else f'{counts}'
            summary['canonical_glb_error'] = reason
    else:
        note = os.path.join(export_dir, 'rigs', 'glb_errors', f'{name}.txt')
        summary['canonical_glb_error'] = (open(note).read().strip() if os.path.isfile(note)
                                          else 'no processed rig GLB')
    if 'canonical_glb_error' in summary:
        notes.append(f"no canonical GLB: {summary['canonical_glb_error']}")
        logger.warning(f"'{name}': no canonical GLB ({summary['canonical_glb_error']}); "
                       f"the cond is written, mesh driving needs a GLB")

    # 7. the deliverables
    np.save(cond_path, {name: entry})
    summary['cond'] = cond_path
    if annotation and not os.path.exists(annotation_path):
        shutil.copyfile(annotation, annotation_path)    # the annotation that built the asset
    summary['canonical_glb'] = None
    if os.path.isfile(canon):
        for fmt in formats:
            shutil.copyfile(os.path.join(canon_dir, f'{name}.{fmt}'), asset_paths[fmt])
        summary['canonical_glb'] = glb_path
        if 'fbx' in formats:
            summary['canonical_fbx'] = asset_paths['fbx']
    if save_clips:
        motions = sorted(Path(features_dir, 'motions').glob(f'{glob.escape(name)}-*.npz')) \
            if os.path.isdir(os.path.join(features_dir, 'motions')) else []
        if motions:
            os.makedirs(clips_dir, exist_ok=True)
            for path in motions:
                shutil.copyfile(path, os.path.join(clips_dir, path.name))
        summary['clips'] = [p.stem for p in motions]
    summary['notes'] = notes
    if preview:
        from data_process.rig_preprocess.preview import render_preview
        try:
            summary['preview'] = render_preview(entry, name, preview_path, notes=notes)
        except Exception as exc:  # noqa: BLE001 — the deliverables are written
            logger.warning(f"'{name}': preview failed: {exc}")
    if not keep_intermediate:
        shutil.rmtree(work)
        summary['rig_glb'] = None           # it lived in work/
    _save_json(summary_path, summary)
    logger.info(f"'{name}': {summary['n_joints']} joints -> {cond_path}"
                + (f", {glb_path}" if summary['canonical_glb'] else ' (no canonical GLB)')
                + (f", {len(summary['clips'])} clip(s) in {clips_dir}" if save_clips else '')
                + (f" ({summary['n_clips']} training clip(s) in {work})" if keep_intermediate else ''))
    logger.info(f"Check {preview_path}, then sample: python -m unimate.inference.sample "
                f"--exp_dir <run> --asset {output_dir} --prompt \"...\"")
    return summary
