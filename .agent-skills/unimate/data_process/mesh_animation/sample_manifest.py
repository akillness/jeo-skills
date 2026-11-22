"""Mesh-driving jobs from a sampler run's ``manifest.json`` (bpy-free).

``python -m unimate.inference.sample`` writes ``<samples>/manifest.json``
beside ``<samples>/motions/*.npy``: for every motion the asset it was
generated for (cond file and key, joint order, canonical GLB). This module
turns it into one job per motion for ``animate_motion.py`` and checks, before
any Blender process starts, that the three still belong together:

- the cond file still holds the asset's entry with the recorded joint order
  (a cond rebuilt since sampling can reorder or rename joints) and, when the
  motion records it, the frame it was sampled in (``frame_digest``,
  ``asset_files.cond_frame_digest``: joint names, hierarchy and canonical
  T-pose; a rest pose patched since sampling keeps the names but moves the
  frame);
- the canonical GLB stores that same joint order (``canonical_joint_order``)
  and, when it records one, the cond's frame (``canonical_frame_digest``);
- the motion has as many joints.

A mismatch is an error rather than a silently scrambled animation.

    python -m data_process.mesh_animation.sample_manifest <samples_dir | manifest.json> \\
        [--include_gt] [--char_path FILE] [--character NAME] [--skip_invalid]

prints ``anim_path<TAB>char_path<TAB>cond_path<TAB>dataset_type`` per job
(``scripts/run_animate_motion.sh <samples_dir>`` runs them) and exits 1 on any
problem; with ``--skip_invalid`` the problems are warnings and the other
motions are still listed. A samples directory without a manifest of its own
but exactly one subdirectory with one (``inbetween/``, ``motion_edit/``,
``motion_expand/``) uses that one. Paths in the manifest are relative to the
directory sampling ran in (the repo root).
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from data_process.utils.asset_files import (  # noqa: E402
    DEFAULT_MIXAMO_CHARACTER, FRAME_DIGEST_KEY, cond_frame_digest, default_assets_dir,
    glb_joint_order, glb_node_extra)

MANIFEST_FILE = 'manifest.json'
FORMAT_PREFIX = 'unimate-samples/'
# dataset_type animate_motion.py takes for an asset that is no dataset object
# type: the object type is then the motion file's prefix, and the cond file
# holds that key (or a single entry).
CUSTOM_DATASET_TYPE = 'general'


def manifest_path(path):
    """``<path>/manifest.json`` for a samples directory (or the manifest of its
    one mode subdirectory that has one), else *path*."""
    if not os.path.isdir(path):
        return path
    own = os.path.join(path, MANIFEST_FILE)
    if os.path.isfile(own):
        return own
    subs = sorted(os.path.join(path, d, MANIFEST_FILE) for d in os.listdir(path)
                  if os.path.isfile(os.path.join(path, d, MANIFEST_FILE)))
    if len(subs) > 1:
        raise ValueError(f"several manifests under {path}: pass one of "
                         f"{', '.join(os.path.dirname(p) for p in subs)}")
    return subs[0] if subs else own


def load_manifest(path):
    path = manifest_path(path)
    with open(path) as f:
        data = json.load(f)
    if not str(data.get('format', '')).startswith(FORMAT_PREFIX):
        raise ValueError(f"{path} is not a sampler manifest (format {data.get('format')!r}).")
    return path, data


def build_jobs(path, include_gt=False, char_path=None, character=None):
    """``(jobs, problems)``: one ``(anim, char, cond, dataset_type)`` per motion
    of the manifest at *path*, and every reason one cannot be driven.
    *char_path* drives every motion with that file instead of the asset's
    canonical GLB (only its joint names are then checked, by animate_motion);
    *character* picks the Mixamo character whose canonical GLB drives the
    ``mixamo`` asset (the file beside the recorded one)."""
    mpath, data = load_manifest(path)
    motions_dir = os.path.join(os.path.dirname(os.path.abspath(mpath)),
                               data.get('motions_dir', 'motions'))
    assets = data.get('assets', {})
    jobs, problems = [], []
    checked = {}
    conds = {}
    frames = {}   # asset -> the cond file entry's frame digest (None: not checkable)

    def asset_glb(info):
        glb = info.get('canonical_glb')
        if info.get('dataset') == 'mixamo' and (character or not glb):
            root = (os.path.dirname(glb) if glb else
                    default_assets_dir(os.path.dirname(info.get('cond_path') or
                                                       os.path.join('dataset', 'features', 'mixamo', 'cond.npy'))))
            glb = os.path.join(root, f'{character or DEFAULT_MIXAMO_CHARACTER}.glb')
        return glb

    def load_cond(path):
        if path not in conds:
            conds[path] = np.load(path, allow_pickle=True).item()
        return conds[path]

    def check_asset(name):
        if name in checked:
            return checked[name]
        info = assets.get(name)
        issues = []
        if info is None:
            issues.append(f"asset {name!r} is not described in the manifest")
            checked[name] = issues
            return issues
        names = [str(n) for n in info.get('joint_names', [])]
        cond_path = info.get('cond_path')
        frames[name] = None
        if not cond_path or not os.path.isfile(cond_path):
            issues.append(f"{name}: cond file {cond_path!r} not found")
        else:
            entry = load_cond(cond_path).get(info.get('cond_key', name))
            if entry is None:
                issues.append(f"{name}: {cond_path} no longer holds {info.get('cond_key')!r}")
            elif [str(n) for n in entry['joint_names']] != names:
                issues.append(f"{name}: {cond_path} changed since sampling (joint order "
                              f"differs); sample again")
            else:
                frames[name] = cond_frame_digest(entry)
        if char_path is None:
            glb = asset_glb(info)
            if not glb or not os.path.isfile(glb):
                no_dir = not (glb and os.path.isdir(os.path.dirname(glb)))
                hint = ("build the canonical assets first (stage 4 with SAVE_GLB=1, or "
                        "feature_extraction/canonical_assets.py)" if no_dir else
                        f"CHARACTER={character or DEFAULT_MIXAMO_CHARACTER} is not among the "
                        f"Mixamo canonical assets" if info.get('dataset') == 'mixamo' else
                        "pass a character (CHAR_PATH) or build it (rig_preprocess, or "
                        "stage 4 with SAVE_GLB=1)")
                issues.append(f"{name}: no canonical GLB ({glb!r}); {hint}")
            else:
                order = glb_joint_order(glb)
                baked = glb_node_extra(glb, FRAME_DIGEST_KEY)
                if order is None:
                    issues.append(f"{name}: {glb} carries no canonical joint order")
                elif order != names:
                    issues.append(f"{name}: {glb} was baked from another cond (joint order "
                                  f"differs from the sampled one)")
                elif baked and frames[name] and baked != frames[name]:
                    issues.append(f"{name}: {glb} was baked from another cond (canonical "
                                  f"T-pose differs from {cond_path}'s); rebuild it")
        checked[name] = issues
        return issues

    for npy, sample in sorted(data.get('samples', {}).items()):
        if sample.get('kind', 'sample') != 'sample' and not include_gt:
            continue
        name = sample.get('asset')
        issues = list(check_asset(name))
        anim = os.path.join(motions_dir, npy)
        if not os.path.isfile(anim):
            issues.append(f"{npy}: motion file not found in {motions_dir}")
        elif not issues:
            n_motion = np.load(anim, mmap_mode='r').shape[1]
            n_asset = len(assets[name]['joint_names'])
            if n_motion != n_asset:
                issues.append(f"{npy}: {n_motion} joints, asset {name!r} has {n_asset}")
            elif sample.get('frame_digest') and frames.get(name) \
                    and sample['frame_digest'] != frames[name]:
                issues.append(f"{npy}: sampled in another canonical frame of {name!r} than "
                              f"{assets[name].get('cond_path')} holds now (T-pose or "
                              f"hierarchy changed); sample again")
        if issues:
            problems.extend(issues)
            continue
        info = assets[name]
        jobs.append((anim, char_path or asset_glb(info), info['cond_path'],
                     info.get('dataset') or CUSTOM_DATASET_TYPE))
    return jobs, sorted(set(problems))


def main(argv=None):
    ap = argparse.ArgumentParser(description="List (and check) the mesh-driving jobs of a "
                                             "sampler run's manifest.json.")
    ap.add_argument('path', help="Samples directory (holding manifest.json) or the manifest.")
    ap.add_argument('--include_gt', action='store_true',
                    help="Also drive the saved ground truth of in-betweening / motion editing.")
    ap.add_argument('--char_path', default=None,
                    help="Drive every motion with this character instead of each asset's "
                         "canonical GLB.")
    ap.add_argument('--character', default=None,
                    help="Mixamo character to drive the mixamo motions with (its canonical GLB "
                         "beside the recorded one), instead of the default.")
    ap.add_argument('--skip_invalid', action='store_true',
                    help="Report a motion that cannot be driven and list the others.")
    args = ap.parse_args(argv)
    try:
        jobs, problems = build_jobs(args.path, args.include_gt, args.char_path, args.character)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.character and args.char_path:
        print(f"warning: --character {args.character} is ignored: --char_path drives every "
              f"motion", file=sys.stderr)
    elif args.character and not any(info.get('dataset') == 'mixamo'
                                     for info in load_manifest(args.path)[1].get('assets', {}).values()):
        print(f"warning: --character {args.character} is ignored: no mixamo motion here",
              file=sys.stderr)
    level = 'warning' if args.skip_invalid else 'error'
    for problem in problems:
        print(f"{level}: {problem}", file=sys.stderr)
    if problems and not args.skip_invalid:
        return 1
    if not jobs:
        print(f"error: no motions to drive in {manifest_path(args.path)}", file=sys.stderr)
        return 1
    for job in jobs:
        print('\t'.join(job))
    return 0


if __name__ == '__main__':
    sys.exit(main())
