"""Bake the export stage's rest-pose assets into the stage-4 canonical frame.

For every object type in ``<features_dir>/cond.npy`` whose processed asset
exists in ``<export_dir>/rigs/`` (``run_export.sh <ds> --save_glb`` /
``--glb_only``), write ``<assets_dir>/<object_type>.glb``: the asset rebuilt
to the cond's canonical T-pose (the joint order, facing, XZ centring, scale
and grounding of the training clips), without animation
(``mesh_animation.canonical_rig.bake_canonical_asset``). A stage-4 feature
clip of that object type (``<features_dir>/motions/*.npz``: ``local_rotations``
+ ``global_positions``) then drives it with no ``cond.npy``; the sampler's
``.npy`` features go through ``animate_motion`` and the cond instead::

    python -m data_process.mesh_animation.animate_lbs \\
        --char_path dataset/canonical_assets/<ds>/<type>.glb \\
        --anim_path dataset/features/<ds>/motions/<type>-<motion>-000.npz

The joint order rides in the GLB as ``canonical_joint_order`` and a digest of
its inputs (the cond entry, its diameter, the source GLB's bytes and
``BAKE_VERSION``) as ``canonical_cond_digest``: an asset whose cond or source
changed is rebuilt on the next run, the others are skipped. The cond's frame
alone (``asset_files.cond_frame_digest``) rides along as
``canonical_frame_digest``: an asset whose source GLB is gone (an object type
of the cond, or a Mixamo character with a canonical GLB but no ``rigs/`` GLB)
keeps its canonical GLB only while that matches the cond, and one without the
key cannot be checked and is kept. Mesh driving checks the same key. A skeleton whose
roll about its joint line the fit cannot determine (collinear joints, or nearly
collinear ones for the fit's residual) is refused.

Mixamo has one object type, ``mixamo`` (the 22 core joints of the rig the clips
were made on, or the full rig if stage 4 kept it), but many characters: every
character in the export's ``rigs/`` gets ``<assets_dir>/<character>.glb``.
Its joint positions are its OWN rest pose through the stage-4 T-pose
canonicalization (the cond's joints, facing pair and diameter, grounding), and
its bone frames are the shared cond's canonical rotations, so a Mixamo feature
clip's local rotations drive every character directly as the change from rest,
the character keeping its proportions (Y_Bot, the clips' rig, reproduces the
clip exactly). The clips' rest root (the cond's T-pose root) rides along as
``canonical_motion_rest_root``: the root then moves by the clip's change from
that rest, from the character's own rest root (``animate_lbs`` reads it), so a character whose hips sit lower than Y_Bot's does not float.

Bones the cond does not have are merged into kept ones. Unskinned meshes
parented under the armature (rigid parts) are bound to their parent bone
before the bake, and an asset without any mesh on the armature fails. A
failure is recorded in ``<assets_dir>/glb_errors/<name>.txt`` (``<name>``: the
object type, for Mixamo the character) and removes a GLB built from older
inputs; an image the canonical GLB lost relative to its source goes to
``<assets_dir>/texture_issues/<name>.txt``.

``<assets_dir>`` defaults to :func:`default_assets_dir`: ``canonical_assets/<ds>``
beside a features root, ``dataset/features/truebones`` giving
``dataset/canonical_assets/truebones``; ``--assets_dir`` overrides.

Usage (pip bpy or Blender; GLB-only, never touches the stage-4 outputs):
    python -m data_process.feature_extraction.canonical_assets \\
        --export_dir dataset/export/truebones --features_dir dataset/features/truebones
``extract_features.py --save_glb`` runs the same after stage 4, in one process;
for a large dataset run this module sharded instead (``--worker_id`` /
``--num_workers``, one short process per shard).
"""

import argparse
import copy
import hashlib
import json
import os
import sys

import numpy as np
from loguru import logger

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from Animation import Animation, positions_global  # noqa: E402
from Quaternions import Quaternions  # noqa: E402

from data_process.mesh_animation.canonical_rig import UndeterminedRoll, bake_canonical_asset  # noqa: E402
from data_process.utils.asset_files import (  # noqa: E402
    FRAME_DIGEST_KEY, GLB_ERRORS_DIR, PROCESSED_GLB_DIR, TEXTURE_ISSUES_DIR,
    cond_digest, cond_frame_digest, default_assets_dir, glb_image_digests, glb_node_extra,
    write_note,
)
from data_process.utils.blender_export import (  # noqa: E402
    import_gltf, load_scene, prepare_skeleton,
)
from data_process.utils.motion_features import process_tpose  # noqa: E402
from data_process.utils.skeleton import get_skeleton_diameter, line_ratio  # noqa: E402

DIGEST_KEY = 'canonical_cond_digest'
# Every file a bake can write for an asset (bake_canonical_asset's formats).
CANONICAL_FORMATS = ('glb', 'fbx')
# Mixamo characters: the clips' rest root in the canonical frame (module docstring).
MOTION_ROOT_KEY = 'canonical_motion_rest_root'
# Part of every digest: bump it when the bake's output changes for the same
# inputs, so the next run rebuilds every GLB.
BAKE_VERSION = 'v3'


def cond_diameter(entry):
    """The leaf-to-leaf diameter of the cond's canonical T-pose: stage 4's
    ``--target_diameter``, recovered from the cond itself (rounded to 1e-4)."""
    offsets = np.asarray(entry['tpos_offsets'], dtype=np.float64)
    J = len(offsets)
    anim = Animation(Quaternions.id((1, J)), offsets[None], Quaternions.id(J),
                     offsets, np.asarray(entry['parents']))
    return round(float(get_skeleton_diameter(anim)), 4)


def cond_face_joints(entry):
    """The cond's facing pair in the ``face_joint_names.json`` form that
    :func:`process_tpose` reads (raw names), or ValueError when it has none."""
    face = entry.get('face_joint_idxs') or {}
    names = [str(n) for n in entry['joint_names']]
    r, l = int(face.get('r_hip', -1)), int(face.get('l_hip', -1))
    if not (0 <= r < len(names) and 0 <= l < len(names)):
        raise ValueError("the cond has no facing pair (face_joint_idxs); the characters "
                         "could not be faced like the clips")
    return {'r_hip': {'raw': names[r]}, 'l_hip': {'raw': names[l]},
            'body_axis': bool(face.get('body_axis', False))}


def file_digest(path):
    """sha1 of a file's bytes."""
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def mixamo_character_cond(char_glb, cond):
    """The cond a Mixamo character is baked to (module docstring): joint
    positions from its own rest pose canonicalized like stage 4's T-pose (the
    cond's joints, facing pair and diameter), bone rotations from the shared
    *cond*.

    Raises:
        ValueError: the character lacks one of the cond's joints, or its
            joints have other names or another hierarchy than the cond's
            (compared by name: sibling order may differ).
    """
    armature, mesh = load_scene(import_gltf, char_glb, fps=30)
    skel = prepare_skeleton(armature, mesh, apply_world=True)
    names = [str(n) for n in skel['bone_names']]
    # The cond's joints: the 22 MIXAMO_CORE_JOINTS by default, the full rig
    # when stage 4 ran with --no-mixamo_core_joints.
    want = [str(n) for n in cond['joint_names']]
    missing = [n for n in want if n not in names]
    if missing:
        raise ValueError(f"{len(missing)} of the cond's {len(want)} joints missing: {missing[:3]}")
    rest = skel['rest_anim_shared']           # export convention (Y-up), as the NPZs
    tpos_data = {
        'names': np.array(names), 'parents': np.asarray(skel['parents_array']),
        'rest_local_pos': np.asarray(rest.positions[0]),
        'rest_local_rot': np.asarray(rest.rotations.qs[0]), 'fps': np.array(30),
    }
    (canon_anim, _offsets, _scale, _ground, canon_parents, canon_names,
     *_rest) = process_tpose(
        tpos_data, corps_idxs=[names.index(n) for n in want],
        corps_names=want, face_joints=cond_face_joints(cond),
        target_diameter=cond_diameter(cond))
    # Same joints and hierarchy, matched by NAME: BFS breaks sibling ties by
    # the source's bone order, which differs between files (a character GLB
    # lists Right* before Left*, the clips' FBX the other way round), and the
    # canonicalization itself does not depend on joint order.
    got = [str(n) for n in canon_names]
    parent_of = {n: (got[p] if p >= 0 else None) for n, p in zip(got, canon_parents)}
    want_parent = {n: (want[int(p)] if int(p) >= 0 else None)
                   for n, p in zip(want, cond['parents'])}
    if sorted(got) != sorted(want) or parent_of != want_parent:
        raise ValueError("joints differ from the shared cond's (names or hierarchy)")
    positions = np.asarray(positions_global(canon_anim)[0])
    out = copy.copy(cond)
    out['tpos_first_frame'] = positions[[got.index(n) for n in want]]
    return out


def glb_digest(path):
    """The ``canonical_cond_digest`` stored in a baked GLB (glTF extras), or None."""
    return glb_node_extra(path, DIGEST_KEY)


class CollinearSkeleton(UndeterminedRoll):
    """A skeleton the bake refuses (see :func:`_check_not_collinear`)."""


def _check_not_collinear(entry, rel_tol=1e-3):
    """The bake fits the asset onto the canonical joints with one similarity;
    joints on a straight line leave the roll about that line undetermined, and
    the mesh would come out at an arbitrary roll, so such skeletons are refused."""
    if line_ratio(entry['tpos_first_frame']) <= rel_tol:
        raise CollinearSkeleton("collinear skeleton: its roll about the joint line is "
                                "undetermined, so the mesh cannot be fitted to the canonical frame")


def _texture_note(assets_dir, name, source, baked):
    """Images the baked GLB lost relative to its source GLB. The glTF exporter
    may rename an image it re-embeds (``dressrun.2`` -> ``dressrun``), so an
    image counts as kept when its bytes are embedded under any name."""
    kept = {digest for _, digest in glb_image_digests(baked)}
    lost = sorted({n for n, digest in glb_image_digests(source) if digest is None or digest not in kept})
    write_note(assets_dir, TEXTURE_ISSUES_DIR, name,
          [f"images of {os.path.basename(source)} not in the canonical GLB: {lost}"] if lost else [])
    if lost:
        logger.warning(f"'{name}': canonical GLB lost image(s) {lost}")


def _shard(name, num_workers):
    """The worker (of *num_workers*) that handles asset *name*."""
    return int(hashlib.sha1(name.encode()).hexdigest(), 16) % num_workers


def _remove_asset_files(out_dir, name, partial=None):
    """Remove ``<name>.<fmt>`` for every format a bake can write (a run asks
    for fewer than an earlier one may have written), the ``<partial>.<fmt>``
    files of a broken bake and the asset's texture note."""
    for fmt in CANONICAL_FORMATS:
        for path in [os.path.join(out_dir, f'{name}.{fmt}')] + \
                ([f'{partial}.{fmt}'] if partial else []):
            if os.path.isfile(path):
                os.remove(path)
    write_note(out_dir, TEXTURE_ISSUES_DIR, name, [])


def bake_canonical_assets(export_dir, features_dir, assets_dir=None, dataset_type=None,
                          object_types=None, worker_id=0, num_workers=1, overwrite=False,
                          formats=('glb',)):
    """Write ``<assets_dir>/<object_type>.glb`` (module docstring; *assets_dir*
    defaults to :func:`default_assets_dir`), plus ``<object_type>.fbx`` when
    *formats* holds ``'fbx'`` (the GLB is always written: it carries the digest).

    Returns ``{'baked': n, 'up_to_date': n, 'no_source': n, 'stale_removed': n,
    'refused': n, 'failed': n}`` (refused: collinear skeletons, an expected
    outcome; stale_removed: the no_source assets whose GLB was baked from
    another cond frame and was removed with its other formats).
    """
    if not 0 <= worker_id < num_workers:
        raise ValueError(f"worker_id {worker_id} not in [0, {num_workers})")
    cond = np.load(os.path.join(features_dir, 'cond.npy'), allow_pickle=True).item()
    out_dir = assets_dir or default_assets_dir(features_dir)
    src_dir = os.path.join(export_dir, PROCESSED_GLB_DIR)
    mixamo = dataset_type == 'mixamo' or list(cond) == ['mixamo']
    if mixamo:
        # (asset name, source GLB, object type) per character.
        if 'mixamo' not in cond:
            raise ValueError(f"{features_dir}/cond.npy has no 'mixamo' entry")
        # Characters with a canonical GLB but no source are checked too.
        chars = sorted({f[:-4] for d in (src_dir, out_dir) if os.path.isdir(d)
                        for f in os.listdir(d) if f.endswith('.glb') and not f.startswith('.')})
        jobs = [(c, os.path.join(src_dir, f'{c}.glb'), 'mixamo') for c in chars
                if object_types is None or c in object_types]
    else:
        types = sorted(cond) if object_types is None else [t for t in object_types if t in cond]
        jobs = [(t, os.path.join(src_dir, f'{t}.glb'), t) for t in types]
    # A worker's share is fixed by the asset name, not by its position in the
    # list: a worker that removes a stale Mixamo GLB changes the listing the
    # workers started after it see.
    jobs = [job for job in jobs if _shard(job[0], num_workers) == worker_id]
    counts = {'baked': 0, 'up_to_date': 0, 'no_source': 0, 'stale_removed': 0,
              'refused': 0, 'failed': 0}
    for name, source, object_type in jobs:
        final = os.path.join(out_dir, f'{name}.glb')
        frame = cond_frame_digest(cond[object_type])
        if not os.path.isfile(source):
            counts['no_source'] += 1
            stored = glb_node_extra(final, FRAME_DIGEST_KEY)
            if stored is not None and frame is not None and stored != frame:
                # Baked from another cond and cannot be rebuilt: it would be
                # driven as if current.
                _remove_asset_files(out_dir, name)
                logger.warning(f"Canonical GLB of '{name}' removed: it was baked from "
                               f"another cond frame and its source {source} is gone")
                counts['stale_removed'] += 1
            continue
        extra_files = [(fmt, os.path.join(out_dir, f'{name}.{fmt}'))
                       for fmt in formats if fmt != 'glb']
        # What the GLB is built from: the cond entry (and its diameter, which
        # scales a Mixamo character), the source asset, the bake version and,
        # for a Mixamo character, the clips' rest root it stores.
        extra = {}
        if mixamo:
            extra[MOTION_ROOT_KEY] = json.dumps(
                [float(v) for v in np.asarray(cond[object_type]['tpos_first_frame'])[0]])
        digest = hashlib.sha1((cond_digest(cond[object_type])
                               + str(cond_diameter(cond[object_type]))
                               + file_digest(source) + ''.join(extra.values())
                               + BAKE_VERSION).encode()).hexdigest()
        if (not overwrite and os.path.isfile(final) and glb_digest(final) == digest
                and all(os.path.isfile(path) for _, path in extra_files)):
            write_note(out_dir, GLB_ERRORS_DIR, name, [])
            counts['up_to_date'] += 1
            continue
        partial = os.path.join(out_dir, f'.{name}.partial')
        try:
            os.makedirs(out_dir, exist_ok=True)
            target = mixamo_character_cond(source, cond[object_type]) if mixamo \
                else cond[object_type]
            _check_not_collinear(target)
            bake_canonical_asset(source, target, partial,
                                 formats=('glb',) + tuple(fmt for fmt, _ in extra_files),
                                 extra_props={DIGEST_KEY: digest, FRAME_DIGEST_KEY: frame,
                                              **extra})
            for fmt, path in extra_files:
                os.replace(f'{partial}.{fmt}', path)
            os.replace(partial + '.glb', final)
            # Another format of the asset that this run did not write was
            # baked from the older inputs (the GLB is always written).
            for fmt in CANONICAL_FORMATS:
                stale = os.path.join(out_dir, f'{name}.{fmt}')
                if fmt != 'glb' and fmt not in formats and os.path.isfile(stale):
                    os.remove(stale)
        except Exception as exc:  # noqa: BLE001 — keep the batch going
            if isinstance(exc, UndeterminedRoll):   # incl. CollinearSkeleton
                logger.info(f"Canonical GLB of '{name}' refused: {exc}")
                counts['refused'] += 1
            else:
                logger.exception(f"Canonical GLB of '{name}' failed")
                counts['failed'] += 1
            write_note(out_dir, GLB_ERRORS_DIR, name, [f'{type(exc).__name__}: {exc}'])
            # A GLB of older inputs would be driven as if current: remove it.
            _remove_asset_files(out_dir, name, partial)
            continue
        write_note(out_dir, GLB_ERRORS_DIR, name, [])
        try:
            _texture_note(out_dir, name, source, final)
        except Exception as exc:  # noqa: BLE001 — the GLB is written; keep it
            logger.warning(f"'{name}': texture comparison failed: {exc}")
        counts['baked'] += 1
    logger.info(f"Canonical GLBs in {out_dir}: {counts} "
                f"({len(jobs)} asset(s){' on this worker' if num_workers > 1 else ''}; "
                f"'no_source' = no {export_dir}/{PROCESSED_GLB_DIR}/<asset>.glb)")
    return counts


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--export_dir', required=True,
                    help='Stage-1 export directory (its rigs/ holds the rest-pose GLBs).')
    ap.add_argument('--features_dir', required=True,
                    help='Stage-4 feature directory (its cond.npy).')
    ap.add_argument('--assets_dir', default=None,
                    help='Output directory (default: canonical_assets/<dataset> beside the '
                         'features root, e.g. dataset/canonical_assets/truebones).')
    ap.add_argument('--dataset_type', default=None,
                    help="'mixamo' (also detected from a cond with the single key 'mixamo'): "
                         "one GLB per character in the export's rigs/; else per object type.")
    ap.add_argument('--object_types', nargs='+', default=None,
                    help='Only these object types (Mixamo: character names).')
    ap.add_argument('--overwrite', action='store_true',
                    help='Rebuild even the GLBs whose inputs are unchanged.')
    ap.add_argument('--worker_id', type=int, default=0)
    ap.add_argument('--num_workers', type=int, default=1)
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    return ap.parse_args(argv)


def main():
    args = parse_args()
    counts = bake_canonical_assets(
        args.export_dir, args.features_dir, assets_dir=args.assets_dir,
        dataset_type=args.dataset_type,
        object_types=args.object_types, worker_id=args.worker_id,
        num_workers=args.num_workers, overwrite=args.overwrite)
    return 1 if counts['failed'] else 0


if __name__ == '__main__':
    sys.exit(main())
