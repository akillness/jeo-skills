"""Process exported NPZ motions into canonicalized training clips.

Supports four dataset layouts via ``--dataset_type``:

- ``truebones``: per-object NPZ files under ``data_dir/motions``, named
  ``{object_type}-{motion}.npz``. Object types are discovered from filename
  prefixes.
- ``objaverse``: same layout as truebones, plus an optional
  ``filtered_objects.txt`` listing object types to skip.
- ``general``: extra assets of your own (``dataset/raw/general/animation``, exported by
  ``export_general.py``); processed exactly like ``objaverse``.
- ``mixamo``: single skeleton / object type. All NPZs live directly under
  ``data_dir/motions`` with no ``{object_type}-`` prefix; caption keys are
  bare motion stems.

An optional ``filtered_clips.txt`` listing individual clips to skip is read
for every layout, and an optional ``clip_trims.txt`` (``<clip stem> <N>``)
drops the first N frames of a clip's export NPZ on load, and an optional
``activity_keep.txt`` exempts listed clips from the low-activity filter. All
three are generated from the hand-reviewed patches by
``tools/patch_annotations.py``.

Stage-2 (captions, category groups) and stage-3 (clean / face joint names)
metadata JSONs are read from ``data_dir`` — see
:mod:`data_process.feature_extraction.metadata`. Every clip has up to three
captions: the normal one (``motion_captions.json`` -> ``captions.json``;
a clip without one is still saved, but left out of ``captions.json``, and the
training loader skips it) and, when the export has them, a short
generic and a longer detail one (``motion_captions_<v>.json`` ->
``captions_<v>.json``, see ``--generic_captions`` / ``--detail_captions``).
Training can sample any of them per step.

Object types are independent, so they can be processed in parallel
(``--num_workers``) and are resumable: each finished object type caches its
result under ``<save_dir>/cond_parts/`` and is skipped on rerun. The cache
records the clip / threshold / topology settings and the export files (name,
size, mtime) it was built from and is re-processed automatically when they
change; delete ``cond_parts/`` (or one entry) to force re-processing for any
other reason. An entry that does not record the export files is re-processed
too, unless ``--adopt_legacy_cache`` vouches that the export has not changed
since it was written. With ``--vis``, a cached object whose previews are
missing, were made with another ``--vis_ground`` or with unrecorded settings
is processed again into a temporary directory, and its outputs replace the
cached ones only when every clip got its preview.

Object types that fail are logged to ``<save_dir>/extract_errors.log``,
recorded in ``filtered_clips.json`` and skipped (no cache entry is written,
so they are retried on the next run) — one bad object never aborts the run.

Usage:
    python -m data_process.feature_extraction.extract_features \\
        --dataset_type truebones \\
        --data_dir dataset/export/truebones \\
        --save_dir dataset/features/truebones
"""

import argparse
import hashlib
import json
import multiprocessing as mp
import os
import shutil
import zipfile
from os.path import join as pjoin

import numpy as np
from loguru import logger
from tqdm import tqdm

from data_process.feature_extraction.metadata import (
    EXTRA_CAPTION_VERSIONS,
    MIXAMO_CORE_JOINTS,
    atomic_np_save,
    build_stats,
    check_metadata_object_types_consistent,
    get_object_captions,
    get_object_face_joints,
    get_object_metadata,
    load_all_metadata,
    load_json,
    print_summary,
    save_metadata_report,
    save_outputs,
)
from data_process.utils.motion_features import process_object


MIXAMO_OBJECT_TYPE = 'mixamo'


def parse_args(argv=None):
    """Stage-4 arguments from *argv* (default: the command line)."""
    parser = argparse.ArgumentParser(
        description="Process exported NPZ motions into canonicalized training clips.")
    # Dataset selection
    parser.add_argument("--dataset_type", type=str, required=True,
                        choices=['truebones', 'objaverse', 'mixamo', 'general'],
                        help="Which dataset layout to process")
    # Directories
    parser.add_argument("--data_dir", type=str, required=True,
                        help="Root data directory (motions under data_dir/motions, "
                             "metadata JSONs in data_dir)")
    parser.add_argument("--save_dir", type=str, required=True,
                        help="Output directory for processed clips and metadata")
    # Clip windowing
    parser.add_argument("--max_clip_len", type=int, default=200,
                        help="Max frames per saved clip")
    parser.add_argument("--diffusion_max_len", type=int, default=90,
                        help="Longest model training max length (the dataloader "
                             "random-crops to it). It sets the clip overlap: a "
                             "training crop is only reachable when it fits inside "
                             "one saved clip, so the stride is max_clip_len minus "
                             "this value. Set it to the largest max_motion_length "
                             "you train with.")
    parser.add_argument("--apply_clip", action="store_true", default=False,
                        help="Crop long motions into overlapping fixed-length clips of "
                             "max_clip_len frames (stride = max_clip_len - "
                             "diffusion_max_len). Otherwise (default), keep only the "
                             "first max_clip_len frames of each motion.")
    # Topology
    parser.add_argument("--max_path_len", type=int, default=5,
                        help="Max path length for topology edge relations")
    parser.add_argument("--max_freqs", type=int, default=8,
                        help="Number of Laplacian eigenvector frequencies for "
                             "spectral joint features")
    # Scaling / grounding
    parser.add_argument("--target_diameter", type=float, default=2.0,
                        help="Target skeleton diameter for leaf-to-leaf scaling")
    parser.add_argument("--use_tpos_ground_height", action="store_true", default=False,
                        help="Ground every motion of an object type on the T-pose's "
                             "floor height. Otherwise (default), each motion is "
                             "grounded on its own minimum Y. The applied value is "
                             "recorded in cond as ground_height / ground_height_mode.")
    # Filtering
    parser.add_argument("--activity_threshold", type=float, default=0.02,
                        help="Min joint activity (temporal spread at canonical "
                             "scale) to keep a clip")
    parser.add_argument("--static_threshold", type=float, default=1e-5,
                        help="Per-frame max-joint displacement below which a frame "
                             "is static; leading/trailing static frames are trimmed")
    parser.add_argument("--jump_step_threshold", type=float, default=0.2,
                        help="Discontinuity filter: a clip is dropped when one "
                             "frame moves the skeleton at least this many clip "
                             "extents (the box the clip sweeps, root travel "
                             "included) AND that step is at least "
                             "--jump_ratio_threshold times the clip median "
                             "(concatenated actions / teleports). 0 disables.")
    parser.add_argument("--jump_ratio_threshold", type=float, default=8.0,
                        help="Discontinuity filter: max/median per-frame joint "
                             "displacement ratio required alongside "
                             "--jump_step_threshold.")
    parser.add_argument("--min_frames", type=int, default=8,
                        help="Minimum frame count for a motion to be kept "
                             "(checked after downsampling and static trimming)")
    parser.add_argument("--mixamo_core_joints", action=argparse.BooleanOptionalAction,
                        default=True,
                        help="(mixamo only) Restrict the rig to the built-in "
                             "22-joint humanoid core (drops finger chains and "
                             "End bones). Use --no-mixamo_core_joints to keep "
                             "the full 65-joint skeleton.")
    parser.add_argument("--min_joints", type=int, default=8,
                        help="Skip object types with fewer joints than this "
                             "(counted after corps filtering)")
    parser.add_argument("--max_joints", type=int, default=150,
                        help="Skip object types with more joints than this "
                             "(counted after corps filtering)")
    # Objaverse-only filtering
    parser.add_argument("--filtered_clips", type=str, default="auto",
                        help="Path to a txt file listing individual export "
                             "clips (motion NPZ stems) to skip, one per line "
                             "with optional '#' comments. Default 'auto' uses "
                             "<data_dir>/filtered_clips.txt if present. Pass an "
                             "empty string to disable. Complements the on-the-fly "
                             "quality filters. Listed clips are dropped before "
                             "any object is processed, so they do NOT appear in "
                             "filtered_clips.json (which records runtime filters).")
    parser.add_argument("--filtered_objects", type=str, default="auto",
                        help="(objaverse / general) Path to a txt file listing object "
                             "types to skip (one per line; blanks and '#' comments "
                             "ignored). Default 'auto' uses "
                             "<data_dir>/filtered_objects.txt if present. Pass an "
                             "empty string to disable.")
    parser.add_argument("--clip_trims", type=str, default="auto",
                        help="Path to a txt file of hand-reviewed head trims, one "
                             "'<clip stem> <N>' per line with optional '#' comments: "
                             "the first N frames of that clip's export NPZ are "
                             "dropped on load, before downsampling and the static "
                             "trim (a bind-pose or foreign first frame that snaps "
                             "into the motion). Default 'auto' uses "
                             "<data_dir>/clip_trims.txt if present. Pass an empty "
                             "string to disable.")
    parser.add_argument("--activity_keep", type=str, default="auto",
                        help="Path to a txt file of clip stems (one per line, '#' "
                             "comments) exempt from the low-activity filter: "
                             "hand-reviewed small but real motions such as a head "
                             "turn or a wave. Default 'auto' uses "
                             "<data_dir>/activity_keep.txt if present. Pass an empty "
                             "string to disable.")
    parser.add_argument("--generic_captions", type=str, default="auto",
                        help="JSON {export clip: generic caption}, the second "
                             "caption of every clip (written by "
                             "tools/patch_annotations.py). Default 'auto' uses "
                             "<data_dir>/motion_captions_generic.json if present. "
                             "Saved as captions_generic.json beside captions.json, "
                             "keyed the same way. Pass an empty string to disable "
                             "(a stale captions_generic.json is then removed). "
                             "Not part of the per-object cache: changing it never "
                             "re-processes an object.")
    parser.add_argument("--detail_captions", type=str, default="auto",
                        help="Like --generic_captions for the third, detail "
                             "caption (7-19 words): default 'auto' uses "
                             "<data_dir>/motion_captions_detail.json if present, "
                             "saved as captions_detail.json.")
    parser.add_argument("--category_groups", type=str, default="auto",
                        help="Path to the body-plan category JSON copied into "
                             "the feature dir (the training loader reads it for "
                             "objects_subset). Default 'auto' uses "
                             "<data_dir>/category_groups.json if present; "
                             "with none, an earlier run's copy is removed. Pass "
                             "an empty string to leave it out — the stage-2 "
                             "classifier may still be running, and a partial "
                             "file would land in the feature dir as if it were "
                             "complete. Copy the finished file in afterwards "
                             "(a later run with an empty string leaves it in "
                             "place); nothing else in this stage reads it.")
    # Execution
    parser.add_argument("--num_workers", type=int, default=1,
                        help="Parallel worker processes (object types are independent)")
    parser.add_argument("--vis", action=argparse.BooleanOptionalAction, default=True,
                        help="Render the per-clip MP4 preview (use --no-vis for bulk runs)")
    parser.add_argument("--vis_ground", action=argparse.BooleanOptionalAction,
                        default=True,
                        help="Render previews with a checkerboard ground plane, "
                             "follow camera, contact shadow and root "
                             "trajectory (default). --no-vis_ground renders "
                             "the plain cubic view instead.")
    parser.add_argument("--adopt_legacy_cache", action="store_true",
                        help="Keep cond_parts/ entries that record no export digest "
                             "instead of re-processing their objects, and stamp them with "
                             "the current one. Only for entries known to be built from the "
                             "current export: nothing checks it.")
    parser.add_argument("--save_glb", action="store_true",
                        help="Afterwards bake <data_dir>/rigs/<asset>.glb (the export stage's "
                             "rest-pose assets, run_export.sh --save_glb / --glb_only) into the "
                             "canonical frame: <canonical_assets_dir>/<object_type>.glb, driven "
                             "by the feature clips with no cond.npy (canonical_assets.py; needs "
                             "bpy; one process, so shard canonical_assets.py for a large dataset).")
    parser.add_argument("--canonical_assets_dir", type=str, default=None,
                        help="Where --save_glb writes (default: canonical_assets/<dataset> "
                             "beside the features root, e.g. dataset/canonical_assets/truebones "
                             "for dataset/features/truebones; <save_dir>_canonical_assets for "
                             "a save_dir outside a features root).")
    return parser.parse_args(argv)


def _resolve_skip_list_path(path, data_dir, filename):
    """Both skip lists are optional: a missing file simply disables that step.

    ``"auto"`` looks for *filename* in *data_dir*; an empty string disables the
    list; any other value is used as given but is still skipped (with a warning)
    when it does not exist, so a stale path never aborts a run.
    """
    if not path:
        return None
    if path == "auto":
        default = pjoin(data_dir, filename)
        if os.path.isfile(default):
            return default
        logger.info(f'No {filename} in {data_dir}; skipping that filter step')
        return None
    if os.path.isfile(path):
        return path
    logger.warning(f'Skip list {path!r} not found; skipping that filter step')
    return None


def resolve_filtered_objects_path(path, data_dir):
    return _resolve_skip_list_path(path, data_dir, 'filtered_objects.txt')


def resolve_filtered_clips_path(path, data_dir):
    return _resolve_skip_list_path(path, data_dir, 'filtered_clips.txt')


def resolve_clip_trims_path(path, data_dir):
    return _resolve_skip_list_path(path, data_dir, 'clip_trims.txt')


def resolve_activity_keep_path(path, data_dir):
    return _resolve_skip_list_path(path, data_dir, 'activity_keep.txt')


def resolve_extra_captions(path, data_dir, version):
    """Load the *version* captions named by ``--<version>_captions`` (or None).

    ``"auto"`` uses ``<data_dir>/motion_captions_<version>.json`` when present
    and an empty string disables them; both then remove a stale
    ``captions_<version>.json``. An explicit path that does not exist raises
    instead: a typo must not silently delete the captions already in the
    feature directory.
    """
    name = f'motion_captions_{version}.json'
    if path == 'auto':
        path = pjoin(data_dir, name)
        if not os.path.isfile(path):
            logger.info(f'No {name} in {data_dir}; no captions_{version}.json this run')
            return None
    elif not path:
        return None
    elif not os.path.isfile(path):
        raise FileNotFoundError(f'--{version}_captions {path!r} does not exist')
    captions = load_json(path)
    logger.info(f'{version.capitalize()} captions: {len(captions)} from {path}')
    return captions


def load_clip_trims(path):
    """Read ``<clip stem> <N>`` head trims; a falsy path yields an empty dict.

    Malformed lines raise instead of being skipped: a trim that silently does
    nothing would leave the snap it was written for in the training data.
    """
    trims = {}
    if not path:
        return trims
    with open(path, 'r') as f:
        for lineno, line in enumerate(f, 1):
            body = line.split('#', 1)[0].split()
            if not body:
                continue
            if len(body) != 2 or not body[1].isdigit() or int(body[1]) < 1:
                raise ValueError(f'{path}:{lineno}: expected "<clip stem> <N>" with '
                                 f'N >= 1, got {line.strip()!r}')
            trims[body[0]] = int(body[1])
    return trims


def resolve_category_groups(path, metadata):
    """Return the category groups to copy into the feature dir, or None.

    ``"auto"`` (the default) keeps whatever ``load_all_metadata`` found in
    the data dir; an empty string drops it; any other value is loaded as an
    explicit path. Nothing in this stage consumes the groups — they are
    passed through to the feature dir — so dropping them only means the
    copy is made later, by hand, once the classifier has finished. Like the
    two skip lists, a missing explicit path is skipped with a warning rather
    than aborting the run.
    """
    if not path:
        if metadata.pop('category_groups', None) is not None:
            logger.info('Ignoring category_groups.json (--category_groups="")')
        return None
    if path != 'auto':
        groups = load_json(path)
        if groups is None:
            logger.warning(f'--category_groups {path!r} not found; the feature '
                           f'dir will get no category_groups.json')
            metadata.pop('category_groups', None)
            return None
        metadata['category_groups'] = groups
    return metadata.get('category_groups')


def load_filtered_objects(path):
    """Read a skip list; a falsy path (no file) yields an empty set."""
    if not path:
        return set()
    with open(path, 'r') as f:
        # one entry per line; blank lines and '#' comments (whole-line or
        # trailing, e.g. "<uuid>    # bone/bone pair") are ignored
        entries = (line.split('#', 1)[0].strip() for line in f)
        return {e for e in entries if e}


def discover_object_types(motion_dir, dataset_type, args):
    """Return (object_types, all_motions) given the dataset layout.

    Only ``.npz`` files are considered, so stray side files in ``motions/``
    never turn into object types with zero motions.
    """
    entries = os.listdir(motion_dir)
    all_motions = [f for f in entries if f.endswith('.npz')]
    if len(all_motions) != len(entries):
        logger.info(f'Ignoring {len(entries) - len(all_motions)} non-NPZ '
                    f'entries in {motion_dir}')

    clips_path = resolve_filtered_clips_path(args.filtered_clips, args.data_dir)
    skip_clips = load_filtered_objects(clips_path)
    if skip_clips:
        before = len(all_motions)
        all_motions = [m for m in all_motions if m[:-4] not in skip_clips]
        logger.info(f'Loaded {len(skip_clips)} entries from {clips_path}; '
                    f'{before} -> {len(all_motions)} motion files after clip filtering')

    if dataset_type == 'mixamo':
        # Single object type; no prefix-based grouping.
        return [MIXAMO_OBJECT_TYPE], all_motions

    object_types = sorted(set(m.split('-')[0] for m in all_motions))
    logger.info(f'Found {len(all_motions)} motion files, {len(object_types)} object types')

    if dataset_type in ('objaverse', 'general'):
        filtered_path = resolve_filtered_objects_path(args.filtered_objects, args.data_dir)
        filtered_object_types = load_filtered_objects(filtered_path)
        if filtered_object_types:
            before = len(object_types)
            object_types = [o for o in object_types if o not in filtered_object_types]
            logger.info(f'Loaded {len(filtered_object_types)} entries from {filtered_path}; '
                        f'{before} -> {len(object_types)} object types after filtering')
        elif args.filtered_objects:
            logger.info(f'No filtered_objects file found '
                        f'(--filtered_objects={args.filtered_objects!r}); '
                        f'processing all {len(object_types)} object types')

    return object_types, all_motions


def collect_object_npzs(object_type, dataset_type, motion_dir, all_motions):
    if dataset_type == 'mixamo':
        return sorted(pjoin(motion_dir, f) for f in all_motions if f.endswith('.npz'))
    return sorted(
        pjoin(motion_dir, f) for f in all_motions
        if f.startswith(object_type + '-') and f.endswith('.npz')
    )


def resolve_captions(object_type, dataset_type, motion_captions):
    # Mixamo caption keys are bare motion stems (no "{object_type}-" prefix),
    # so the full captions dict is passed through untouched.
    if dataset_type == 'mixamo':
        return motion_captions
    return get_object_captions(object_type, motion_captions)


def _object_part_path(save_dir, object_type):
    return pjoin(save_dir, 'cond_parts', f'{object_type}.npy')


def _error_log_path(save_dir):
    return pjoin(save_dir, 'extract_errors.log')


# Settings that determine a cached object result's contents. A cache entry
# built with different values is stale and gets re-processed. ``save_vis``
# is deliberately excluded: it only controls the MP4 previews, not the clips
# or the cond.
CACHE_PARAM_KEYS = (
    'max_clip_len', 'clip_stride', 'apply_clip',
    'max_path_len', 'max_freqs',
    'target_diameter', 'activity_threshold', 'static_threshold',
    'min_frames', 'jump_step_threshold', 'jump_ratio_threshold',
    'min_joints', 'max_joints',
    'use_tpos_ground_height',
    'corps_names',
)

# Per-object METADATA inputs baked into the result (captions land in the
# cond, face joints steer the facing canonicalization, clean names are
# stored per joint). Hashed into the cache key so a stage-2/3 rerun —
# new captions, corrected face pairs, recleaned labels — re-processes the
# affected object types instead of silently resuming stale results.
CACHE_DATA_KEYS = ('captions', 'face_joints', 'clean_names')


def _digest(value):
    """Stable short digest of a JSON-serializable metadata value."""
    blob = json.dumps(value, sort_keys=True, default=str)
    return hashlib.sha1(blob.encode('utf-8')).hexdigest()[:16]


def _cache_params(task):
    """Extract the cache-invalidating settings from a task dict."""
    params = {k: task[k] for k in CACHE_PARAM_KEYS}
    for k in CACHE_DATA_KEYS:
        params[f'{k}_digest'] = _digest(task[k])
    # The object's source clip list. A clip added to the export or newly
    # listed in filtered_clips.txt must re-process the object: a cached
    # result would otherwise keep the old clip set alive in the cond and
    # leave the dropped clip's NPZ in motions/, which the training loader
    # enumerates directly. Basenames only, so relocating data_dir (the
    # export dirs are symlinks) does not invalidate every entry.
    params['clips_digest'] = _digest(
        sorted(os.path.basename(p) for p in task['object_npzs']))
    # Only objects with a head trim carry the key, so adding clip_trims.txt
    # re-processes exactly those object types and leaves every other cached
    # result valid.
    if task.get('head_trims'):
        params['head_trims_digest'] = _digest(task['head_trims'])
    # Same for activity_keep.txt: only objects owning a listed clip carry it.
    if task.get('activity_keep'):
        params['activity_keep_digest'] = _digest(sorted(task['activity_keep']))
    # Root offsets are baked into the export NPZs in place (same names), so
    # neither clips_digest nor any list above sees them; the quats recorded in
    # the NPZs are the only trace. Adding, changing or removing one therefore
    # re-processes exactly the owning object type.
    if task.get('root_offsets'):
        params['root_offsets_digest'] = _digest(task['root_offsets'])
    # Rest orientation fixes are baked into the NPZs the same way.
    if task.get('rest_orientations'):
        params['rest_orientations_digest'] = _digest(task['rest_orientations'])
    return params


# Written into an export NPZ by tools/patch_annotations.py (apply_root_offsets)
# when it bakes a root orientation fix in; keep the name in sync.
ROOT_OFFSET_KEY = 'root_offset_applied'
# Written by tools/patch_annotations.py (apply_rest_orientations); keep in sync.
REST_ORIENTATION_KEY = 'rest_orientation_applied'


def read_root_offsets(object_npzs, key=ROOT_OFFSET_KEY):
    """``{clip stem: [w, x, y, z]}`` for the export NPZs carrying a baked-in
    fix under *key* (a root offset by default, or a rest orientation). Only the
    zip directory is read for the others, so this stays cheap over a whole
    dataset."""
    offsets = {}
    for path in object_npzs:
        with zipfile.ZipFile(path) as zf:
            if key + '.npy' not in zf.namelist():
                continue
        with np.load(path) as d:
            offsets[os.path.basename(path)[:-4]] = [round(float(x), 6) for x in d[key]]
    return offsets


def _params_hash(params):
    """Stable hash of the cache-invalidating settings."""
    blob = json.dumps(params, sort_keys=True, default=str)
    return hashlib.sha1(blob.encode('utf-8')).hexdigest()


def _export_digest(task):
    """Digest of the inputs the settings hash cannot see: each clip NPZ's name,
    size and mtime (a re-export under the same clip names) and the object's
    ``joint_names.json`` entry (its order drives the clean-name realignment).
    Kept beside ``params_hash`` rather than in it (see :func:`_load_cached_payload`)."""
    files = []
    for path in sorted(task['object_npzs']):
        st = os.stat(path)
        files.append([os.path.basename(path), st.st_size, st.st_mtime_ns])
    return _digest([files, task.get('expected_names')])


def _load_cached_payload(part_path, object_type, params, params_hash, export_digest,
                         adopt_legacy=False):
    """Return the cache entry of an object (``result`` and what it was built
    from), or None when absent / stale / unreadable.

    An entry without an ``export_digest`` cannot show that it was built from
    the current export, so it is a miss unless *adopt_legacy*
    (``--adopt_legacy_cache``) vouches for it; it is then stamped with the
    current digest."""
    if not os.path.isfile(part_path):
        return None
    try:
        payload = np.load(part_path, allow_pickle=True).item()
    except Exception as e:  # noqa: BLE001 — a bad cache entry is just a miss
        logger.warning(f'[{object_type}] unreadable cache {part_path} ({e}); '
                       f're-processing')
        return None

    if 'params_hash' not in payload or 'result' not in payload:
        logger.info(f'[{object_type}] cache invalidated (entry predates settings '
                    f'tracking or holds no result); re-processing')
        return None
    if payload['params_hash'] == params_hash:
        cached_digest = payload.get('export_digest')
        if cached_digest is None:
            if not adopt_legacy:
                logger.info(f'[{object_type}] cache entry records no export digest; '
                            f're-processing (--adopt_legacy_cache keeps entries known to '
                            f'match the current export)')
                return None
            payload['export_digest'] = export_digest
            atomic_np_save(part_path, payload)
            return payload
        if cached_digest == export_digest:
            return payload
        logger.info(f'[{object_type}] cache invalidated (export NPZs or joint_names.json '
                    f'entry changed); re-processing')
        return None

    cached_params = payload.get('params') or {}
    diff = ', '.join(
        f'{k}: {cached_params.get(k, "<missing>")} -> {v}'
        for k, v in sorted(params.items())
        if cached_params.get(k, '<missing>') != v)
    logger.info(f'[{object_type}] cache invalidated (settings changed: {diff}); '
                f're-processing')
    return None


def _prune_object_clips(save_dir, clip_prefix, prune_vis):
    """Delete the clip files a previous run wrote for this object type.

    ``process_object`` only ever writes, and the training loader enumerates
    ``motions/`` rather than ``captions.json``, so a clip that disappears from
    an object (removed from the export, or newly listed in
    ``filtered_clips.txt``) would keep its stale
    ``motions/{object}-{motion}-{idx}.npz`` on disk and still be trained on.
    Called only on a cache miss, i.e. right before the object is rewritten in
    full. ``clip_prefix`` is ``"{object_type}-"`` (empty for mixamo, whose
    single object type owns every file in the directory).

    Previews are pruned only when the run regenerates them (``--vis``), so a
    later ``--no-vis`` run does not throw away the MP4s an earlier one made.
    """
    targets = [('motions', '.npz')] + ([('videos', '.mp4')] if prune_vis else [])
    removed = 0
    for sub, ext in targets:
        directory = pjoin(save_dir, sub)
        if not os.path.isdir(directory):
            continue
        for name in os.listdir(directory):
            if name.startswith(clip_prefix) and name.endswith(ext):
                try:
                    os.remove(pjoin(directory, name))
                    removed += 1
                except OSError as e:  # noqa: PERF203 — one bad file must not abort
                    logger.warning(f'Could not remove stale {sub}/{name}: {e}')
    return removed


def _vis_record(save_vis, vis_ground):
    """The preview settings a cache entry records: None when the run made no
    previews."""
    return {'ground': bool(vis_ground)} if save_vis else None


def _previews_current(payload, save_dir, clip_prefix, vis_ground):
    """Whether a cached object's previews are the ones a ``--vis`` run with
    *vis_ground* makes: the entry records previews made with that ground
    setting (an entry that records none, or no settings at all, does not
    qualify), and every clip of the object in ``motions/`` has its
    ``videos/<clip>.mp4``."""
    record = payload.get('vis')
    if not isinstance(record, dict) or record.get('ground') != bool(vis_ground):
        return False
    motions_dir, videos_dir = pjoin(save_dir, 'motions'), pjoin(save_dir, 'videos')
    clips = [name[:-4] for name in (os.listdir(motions_dir) if os.path.isdir(motions_dir) else [])
             if name.startswith(clip_prefix) and name.endswith('.npz')]
    return all(os.path.isfile(pjoin(videos_dir, clip + '.mp4')) for clip in clips)


def _rebuild_dir(save_dir, object_type):
    return pjoin(save_dir, f'.rebuild_{object_type}')


def _object_files(save_dir, object_type, clip_prefix):
    """``(subdir, name)`` of every output file of the object: its clips,
    previews and T-pose image."""
    files = []
    for sub, ext in (('motions', '.npz'), ('videos', '.mp4')):
        d = pjoin(save_dir, sub)
        files += [(sub, name) for name in (os.listdir(d) if os.path.isdir(d) else [])
                  if name.startswith(clip_prefix) and name.endswith(ext)]
    if os.path.isfile(pjoin(save_dir, 'tpose', f'{object_type}.png')):
        files.append(('tpose', f'{object_type}.png'))
    return files


def _rebuild_with_previews(object_type, task, clip_prefix, part_path, payload, vis):
    """Process a cached object again, with previews, into a temporary
    directory beside the outputs; when every clip got its preview, swap its
    files in and write its new cache entry.

    The swap removes the cache entry first and moves the object's current
    files into the temporary directory before the new ones go in, so an
    error midway is undone (old files and entry restored) and a crash
    midway leaves a miss, never an entry beside half-replaced files.

    Returns ``('rebuilt', result)``; ``('kept', None)`` when the rebuild
    failed and the cached files and entry are as before; or ``('lost',
    error)`` when an undo failed too: the entry is then gone, so the next
    run re-processes the object.
    """
    save_dir = task['save_dir']
    tmp = _rebuild_dir(save_dir, object_type)
    shutil.rmtree(tmp, ignore_errors=True)
    try:
        obj_cond, n_clips, n_frames, n_joints, filtered = process_object(
            object_type, **dict(task, save_dir=tmp))
        made = [(sub, name) for sub in ('motions', 'videos', 'tpose')
                for name in (sorted(os.listdir(pjoin(tmp, sub)))
                             if os.path.isdir(pjoin(tmp, sub)) else [])]
        videos = {name for sub, name in made if sub == 'videos'}
        missing = [name[:-4] for sub, name in made
                   if sub == 'motions' and name[:-4] + '.mp4' not in videos]
        if missing:
            raise RuntimeError(f'{len(missing)} preview(s) not rendered, e.g. {missing[0]}')
    except Exception as e:  # noqa: BLE001 — nothing of the cached object was touched
        shutil.rmtree(tmp, ignore_errors=True)
        logger.warning(f'[{object_type}] previews could not be rebuilt '
                       f'({type(e).__name__}: {e}); kept the cached clips')
        return 'kept', None
    result = {'cond': obj_cond, 'n_clips': n_clips, 'n_frames': n_frames,
              'n_joints': n_joints, 'filtered': filtered}

    old_dir = pjoin(tmp, 'previous')
    moved_out, moved_in = [], []
    try:
        if os.path.isfile(part_path):
            os.remove(part_path)
        for sub, name in _object_files(save_dir, object_type, clip_prefix):
            os.makedirs(pjoin(old_dir, sub), exist_ok=True)
            os.replace(pjoin(save_dir, sub, name), pjoin(old_dir, sub, name))
            moved_out.append((sub, name))
        for sub, name in made:
            os.makedirs(pjoin(save_dir, sub), exist_ok=True)
            os.replace(pjoin(tmp, sub, name), pjoin(save_dir, sub, name))
            moved_in.append((sub, name))
        atomic_np_save(part_path, {**payload, 'result': result, 'vis': vis})
    except Exception as e:  # noqa: BLE001 — undo the swap
        try:
            for sub, name in moved_in:
                os.remove(pjoin(save_dir, sub, name))
            for sub, name in moved_out:
                os.replace(pjoin(old_dir, sub, name), pjoin(save_dir, sub, name))
            atomic_np_save(part_path, payload)
        except Exception as undo:  # noqa: BLE001 — leave a miss behind
            if os.path.isfile(part_path):
                os.remove(part_path)
            logger.error(f'[{object_type}] previews could not be swapped in '
                         f'({type(e).__name__}: {e}) nor the swap undone '
                         f'({type(undo).__name__}: {undo}); the object will be re-processed '
                         f'(its earlier files are in {old_dir} until then)')
            return 'lost', f'swap failed ({type(e).__name__}: {e}), undo failed ({undo})'
        shutil.rmtree(tmp, ignore_errors=True)
        logger.warning(f'[{object_type}] previews could not be swapped in '
                       f'({type(e).__name__}: {e}); restored the cached clips')
        return 'kept', None
    shutil.rmtree(tmp, ignore_errors=True)
    return 'rebuilt', result


def _failed(object_type, save_dir, error):
    """The result of an object that failed, its error appended to
    ``extract_errors.log``."""
    try:
        os.makedirs(save_dir, exist_ok=True)
        with open(_error_log_path(save_dir), 'a') as log_file:
            log_file.write(f'{object_type}\t{error}\n')
    except OSError as log_err:
        logger.warning(f'[{object_type}] could not write error log: {log_err}')
    return {
        'cond': None, 'n_clips': 0, 'n_frames': 0, 'n_joints': 0,
        'filtered': [{'name': f'{object_type} (all clips)',
                      'reason': f'processing failed: {error}'}],
        'error': error,
    }


def process_object_task(task):
    """Process one object type, caching its result for resume.

    ``task`` bundles every :func:`process_object` argument plus the part
    path. The cached result is reused only when it was produced with the same
    clip / threshold / topology settings (see ``CACHE_PARAM_KEYS``).

    With ``save_vis``, a cached object whose previews are not current (see
    :func:`_previews_current`) is rebuilt with :func:`_rebuild_with_previews`;
    if that fails, the cached result is used without them, unless its files
    could not be restored, which fails the object.

    Failures are contained here: the object is reported as failed (and its
    error appended to ``extract_errors.log``) instead of propagating, which
    with ``mp.Pool`` would kill the whole run. On a cache miss the old entry
    is removed before the object's clips are pruned, and no entry is written
    for a failed object, so it is retried on the next run whatever its
    settings.

    Returns ``(object_type, result_dict, from_cache)``.
    """
    object_type = task.pop('object_type')
    part_path = task.pop('part_path')
    clip_prefix = task.pop('clip_prefix')
    params = _cache_params(task)
    params_hash = _params_hash(params)
    export_digest = _export_digest(task)
    task.pop('root_offsets', None)   # cache key only; process_object reads the NPZs
    task.pop('rest_orientations', None)
    adopt_legacy = task.pop('adopt_legacy_cache', False)
    vis = _vis_record(task['save_vis'], task['vis_ground'])

    payload = _load_cached_payload(part_path, object_type, params, params_hash,
                                   export_digest, adopt_legacy=adopt_legacy)
    if payload is not None:
        if not task['save_vis'] or _previews_current(payload, task['save_dir'],
                                                     clip_prefix, task['vis_ground']):
            return object_type, payload['result'], True
        status, value = _rebuild_with_previews(object_type, task, clip_prefix,
                                               part_path, payload, vis)
        if status == 'rebuilt':
            return object_type, value, False
        if status == 'kept':
            return object_type, payload['result'], True
        return object_type, _failed(object_type, task['save_dir'], value), False

    try:
        # The stale entry goes before the clips it describes: a run that
        # fails below must not leave an entry that a later run with the old
        # settings would reuse without its clips.
        if os.path.isfile(part_path):
            os.remove(part_path)
        shutil.rmtree(_rebuild_dir(task['save_dir'], object_type), ignore_errors=True)
        removed = _prune_object_clips(task['save_dir'], clip_prefix, task['save_vis'])
        if removed:
            logger.info(f'[{object_type}] removed {removed} clip files from a '
                        f'previous run before re-processing')
        obj_cond, n_clips, n_frames, n_joints, filtered = process_object(
            object_type, **task)
    except Exception as e:  # noqa: BLE001 — keep the batch going
        logger.exception(f'[{object_type}] failed to process')
        return object_type, _failed(object_type, task['save_dir'],
                                    f'{type(e).__name__}: {e}'), False

    result = {'cond': obj_cond, 'n_clips': n_clips, 'n_frames': n_frames,
              'n_joints': n_joints, 'filtered': filtered}
    # Atomic: a worker killed mid-write can never leave a half-written cache
    # entry behind (unreadable ones are treated as misses, but this keeps them
    # from happening in the first place).
    atomic_np_save(part_path, {'params_hash': params_hash, 'params': params,
                               'export_digest': export_digest, 'result': result,
                               'vis': vis})
    return object_type, result, False


def build_object_tasks(args, clip_stride, motion_dir, metadata):
    face_joint_names = metadata.get('face_joint_names')
    clean_joint_names = metadata.get('clean_joint_names')
    joint_names = metadata.get('joint_names')
    motion_captions = metadata.get('motion_captions')

    object_types, all_motions = discover_object_types(motion_dir, args.dataset_type, args)

    trims_path = resolve_clip_trims_path(args.clip_trims, args.data_dir)
    clip_trims = load_clip_trims(trims_path)
    if clip_trims:
        stems = {m[:-4] for m in all_motions}
        missing = sorted(set(clip_trims) - stems)
        logger.info(f'Loaded {len(clip_trims)} head trims from {trims_path}'
                    + (f'; {len(missing)} name no motion being processed '
                       f'(filtered or absent): {missing[:5]}' if missing else ''))

    keep_path = resolve_activity_keep_path(args.activity_keep, args.data_dir)
    activity_keep = load_filtered_objects(keep_path)
    if activity_keep:
        stems = {m[:-4] for m in all_motions}
        missing = sorted(activity_keep - stems)
        logger.info(f'Loaded {len(activity_keep)} low-activity exemptions from {keep_path}'
                    + (f'; {len(missing)} name no motion being processed '
                       f'(filtered or absent): {missing[:5]}' if missing else ''))

    tasks = []
    for object_type in object_types:
        object_npzs = collect_object_npzs(object_type, args.dataset_type,
                                          motion_dir, all_motions)
        head_trims = {s: clip_trims[s] for s in
                      (os.path.basename(p)[:-4] for p in object_npzs) if s in clip_trims}
        keep = sorted(s for s in (os.path.basename(p)[:-4] for p in object_npzs)
                      if s in activity_keep)
        face_joints = get_object_face_joints(object_type, face_joint_names)
        if not face_joints:
            if args.dataset_type == 'mixamo':
                raise ValueError(f'No face_joints entry for {object_type}; '
                                 f'face_joint_names.json is required for mixamo')
            logger.info(f'No face_joints entry for {object_type}; using identity facing')

        tasks.append(dict(
            object_type=object_type,
            part_path=_object_part_path(args.save_dir, object_type),
            object_npzs=object_npzs,
            head_trims=head_trims,
            activity_keep=keep,
            root_offsets=read_root_offsets(object_npzs),
            rest_orientations=read_root_offsets(object_npzs, key=REST_ORIENTATION_KEY),
            # Mixamo clip files carry no "{object_type}-" prefix; its single
            # object type owns the whole directory.
            clip_prefix=('' if args.dataset_type == 'mixamo'
                         else f'{object_type}-'),
            save_dir=args.save_dir,
            max_clip_len=args.max_clip_len, clip_stride=clip_stride,
            apply_clip=args.apply_clip,
            max_path_len=args.max_path_len, max_freqs=args.max_freqs,
            captions=resolve_captions(object_type, args.dataset_type, motion_captions),
            face_joints=face_joints,
            corps_names=(MIXAMO_CORE_JOINTS
                         if args.dataset_type == 'mixamo'
                         and args.mixamo_core_joints else None),
            clean_names=get_object_metadata(object_type, clean_joint_names),
            expected_names=get_object_metadata(object_type, joint_names),
            require_face=args.dataset_type == 'mixamo',
            target_diameter=args.target_diameter,
            use_tpos_ground_height=args.use_tpos_ground_height,
            activity_threshold=args.activity_threshold,
            static_threshold=args.static_threshold,
            min_frames=args.min_frames,
            jump_step_threshold=args.jump_step_threshold,
            jump_ratio_threshold=args.jump_ratio_threshold,
            min_joints=args.min_joints, max_joints=args.max_joints,
            save_vis=args.vis, vis_ground=args.vis_ground,
            adopt_legacy_cache=args.adopt_legacy_cache,
        ))
    return tasks


def main(args):
    clip_stride = args.max_clip_len - args.diffusion_max_len
    if clip_stride <= 0:
        message = (f'--diffusion_max_len ({args.diffusion_max_len}) must be smaller '
                   f'than --max_clip_len ({args.max_clip_len}): the clip stride is '
                   f'their difference, and {clip_stride} would '
                   + ('never advance the window'
                      if clip_stride == 0 else 'walk the window backwards'))
        if args.apply_clip:
            raise ValueError(message)
        logger.warning(f'{message}. Harmless here because --apply_clip is off '
                       f'(the stride is unused), but fix it before enabling it.')

    os.makedirs(args.save_dir, exist_ok=True)

    motion_dir = pjoin(args.data_dir, 'motions')

    metadata = load_all_metadata(args.data_dir)
    logger.info(f'Loaded metadata from {args.data_dir}: '
                + ', '.join(f'{k}={len(v)}' for k, v in metadata.items()))
    check_metadata_object_types_consistent(metadata)
    category_groups = resolve_category_groups(args.category_groups, metadata)
    # Resolved up front so a bad --<v>_captions path fails before any work.
    extra_captions = {v: resolve_extra_captions(getattr(args, f'{v}_captions'), args.data_dir, v)
                      for v in EXTRA_CAPTION_VERSIONS}

    tasks = build_object_tasks(args, clip_stride, motion_dir, metadata)

    cond = {}
    all_filtered_clips = {}
    clips_per_object = {}
    joints_per_object = {}
    total_frames = 0
    max_njoints = 0
    n_cached = 0
    failed_objects = {}

    def accumulate(object_type, result, from_cache):
        nonlocal total_frames, max_njoints, n_cached
        n_cached += int(from_cache)
        if result.get('error'):
            failed_objects[object_type] = result['error']
        if result['n_clips']:
            cond[object_type] = result['cond']
            clips_per_object[object_type] = result['n_clips']
            joints_per_object[object_type] = result['n_joints']
            total_frames += result['n_frames']
            max_njoints = max(max_njoints, result['n_joints'])
        if result['filtered']:
            all_filtered_clips[object_type] = result['filtered']

    pbar = tqdm(total=len(tasks), desc="Processing objects", unit="obj")
    if args.num_workers > 1:
        with mp.Pool(args.num_workers) as pool:
            for object_type, result, from_cache in pool.imap_unordered(
                    process_object_task, tasks):
                accumulate(object_type, result, from_cache)
                pbar.update(1)
    else:
        for task in tasks:
            accumulate(*process_object_task(task))
            pbar.update(1)
    pbar.close()

    if n_cached:
        logger.info(f'Resumed {n_cached}/{len(tasks)} object types from cond_parts/ '
                    f'(delete that directory to force re-processing)')
    if failed_objects:
        logger.error(f'{len(failed_objects)}/{len(tasks)} object types failed and were '
                     f'skipped (retried on the next run); see '
                     f'{_error_log_path(args.save_dir)}: '
                     + ', '.join(sorted(failed_objects)))

    all_captions = save_outputs(args.save_dir, cond, all_filtered_clips,
                                category_groups=category_groups,
                                extra_captions=extra_captions,
                                keep_category_groups=args.category_groups == '')
    stats = build_stats(clips_per_object, joints_per_object, total_frames, max_njoints)
    print_summary(stats)
    save_metadata_report(args.save_dir, stats, all_filtered_clips,
                         all_captions=all_captions, category_groups=category_groups)
    if args.save_glb:
        # bpy only here, so the stage itself stays Blender-free.
        from data_process.feature_extraction.canonical_assets import bake_canonical_assets
        glb_counts = bake_canonical_assets(args.data_dir, args.save_dir,
                                           assets_dir=args.canonical_assets_dir,
                                           dataset_type=args.dataset_type)
        if glb_counts['failed']:
            logger.error(f"{glb_counts['failed']} canonical GLB(s) failed; see glb_errors/ in "
                         f"the canonical_assets directory (the features are complete)")
    logger.info('Dataset processing complete.')


if __name__ == "__main__":
    main(parse_args())
