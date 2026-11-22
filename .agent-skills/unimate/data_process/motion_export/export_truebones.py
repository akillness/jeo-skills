"""Export Truebones FBX clips to NPZ motion data.

Consumes the curated flat layout of the Truebones ZOO dataset: one FBX per
clip, named ``{Species}-{Action}.fbx`` (species never contains ``-``), all in
a single directory. Files are grouped by species so skeleton pruning is
shared across every clip of that species.

Pipeline: import → select armature/mesh → extract animation → Z-up → Y-up →
prune skeleton (shared across the species' clips) → save per-clip NPZ + MP4
+ rest-pose PNG.

``--save_glb`` also writes ``rigs/<species>.glb``: the species in its rest
pose on the pruned skeleton, without animation (``processed_assets.export_asset_glb``),
built from the FBX of one clip on the species' main skeleton (its
``joint_names.json`` entry); every clip NPZ of that skeleton drives it as a
character (``mesh_animation``). Clips of another rig variant (KingCobra and
Monkey ship two) are logged; drive those from their FBX. On an existing export
it only adds the missing GLBs (the NPZs are not rewritten). ``--glb_only`` does
only that, also for an export without completion markers (the released one),
and writes nothing else; it shards species with ``--num_workers``.

Usage (Blender headless):
    blender -b -P data_process/motion_export/export_truebones.py -- \
        --data_dir dataset/raw/truebones/animation \
        --output_dir dataset/export/truebones
"""

import bpy  # noqa: F401 — fail fast when the bpy module is unavailable
import sys
import os
import numpy as np
from tqdm import tqdm
import argparse
from pathlib import Path
from loguru import logger

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from data_process.utils.blender_export import (
    import_fbx,
    load_scene, prepare_skeleton, extract_all_actions, save_rest_pose_vis,
    prune_skeleton_shared,
    action_frame_range, sanitize_action_name, sanitize_object_type,
    save_motion, write_export_summary, truebones_clip_name,
    is_asset_complete, mark_asset_complete,
)
from data_process.utils.asset_files import (
    asset_glb_missing, log_other_skeletons, main_skeleton_clips, record_glb_error,
    REPLACED_DIR, remove_asset_glb, report_glb_errors, set_aside_old_clips,
)
from data_process.utils.processed_assets import build_asset_glb


# ─────────────────────────────────────────────────────────────────────────────
# Per-FBX extraction (one action per file)
# ─────────────────────────────────────────────────────────────────────────────

def extract_single_fbx(fbx_path, fps=30, dtype=np.float64):
    """Import one FBX file and return its (anim, rest_anim, names, skin_matrix, nbones)."""
    assert os.path.exists(fbx_path), f"FBX file not found: {fbx_path}"

    armature, mesh = load_scene(import_fbx, fbx_path, fps=fps)
    assert armature.animation_data is not None and armature.animation_data.action is not None, \
        f"Armature '{armature.name}' has no animation data or action."

    action = armature.animation_data.action
    start_frame, end_frame = action_frame_range(action)
    logger.info(f"Action frame range: {start_frame} to {end_frame}")

    skel = prepare_skeleton(armature, mesh, dtype=dtype, apply_world=True)
    extracted = extract_all_actions(
        armature, {action.name: (start_frame, end_frame)},
        skel['rest_local_pos'], skel['parents_array'],
        skel['rest_anim'], skel['nbones'], dtype=dtype,
    )
    _, anim = extracted[0]
    return {
        'anim': anim,
        'rest_anim': skel['rest_anim_shared'],
        'names': skel['bone_names'],
        'skin_matrix': skel['skin_matrix'],
        'nbones': skel['nbones'],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Shared post-processing: pruning, visualization, saving
# ─────────────────────────────────────────────────────────────────────────────

def postprocess_and_save(obj_type, extracted, rest_anim_shared, bone_names,
                         skin_matrix, output_dir, fps,
                         consider_parent_rotate=True, save_vis=True,
                         save_tpose=True):
    """Shared skeleton pruning, visualization, and per-clip NPZ saving."""
    motion_save_dir = os.path.join(output_dir, "motions")
    vis_save_dir    = os.path.join(output_dir, "videos")
    tpos_save_dir   = os.path.join(output_dir, "tpose")
    os.makedirs(motion_save_dir, exist_ok=True)
    os.makedirs(vis_save_dir,    exist_ok=True)

    anims_list = [anim for _, anim in extracted]
    anims_list, rest_anim_pruned, names_pruned, skin_matrix_pruned = prune_skeleton_shared(
        anims_list, rest_anim_shared, list(bone_names), skin_matrix.copy(),
        consider_parent_rotate=consider_parent_rotate,
    )

    # No joint-count gate here: stage 4 (feature_extraction --min_joints /
    # --max_joints) decides which skeletons enter training, so the export
    # stays complete.
    if save_tpose:
        save_rest_pose_vis(tpos_save_dir, obj_type, rest_anim_pruned)

    for i, (action_name, _) in enumerate(extracted):
        clean_action_name = sanitize_action_name(action_name)
        clip_name = f"{obj_type}-{clean_action_name}"
        save_motion(
            os.path.join(motion_save_dir, f"{clip_name}.npz"),
            os.path.join(vis_save_dir,    f"{clip_name}.mp4"),
            anims_list[i], rest_anim_pruned,
            names_pruned, skin_matrix_pruned, fps,
            action_name=clean_action_name, save_vis=save_vis,
        )

    logger.info(f"Saved {len(extracted)} clips for '{obj_type}'")
    return {obj_type: names_pruned}


# ─────────────────────────────────────────────────────────────────────────────
# Per-species export
# ─────────────────────────────────────────────────────────────────────────────

# Clips (source FBXs) tried for a species' processed GLB before giving up.
MAX_GLB_ATTEMPTS = 3


def save_species_glb(obj_type, fbx_paths, output_dir, fps=30, want=None):
    """The species' processed GLB, from the FBX of its first clip on the main
    skeleton (*want* joint names, else its ``joint_names.json`` entry; see
    ``asset_files.main_skeleton_clips``). A failure is recorded, not raised."""
    main, others = main_skeleton_clips(output_dir, obj_type, want=want)
    log_other_skeletons(obj_type, others)
    fbx_by_clip = {}
    for fbx_path in fbx_paths:
        try:
            fbx_by_clip[truebones_clip_name(Path(fbx_path).stem)] = fbx_path
        except ValueError:
            continue
    candidates = [(npz_path, fbx_by_clip[os.path.basename(npz_path)[:-4]]) for npz_path in main
                  if os.path.basename(npz_path)[:-4] in fbx_by_clip]
    # The next main-skeleton clip if one fails (a bad FBX), but not every one:
    # a failure that repeats is the asset's, and is recorded by build_asset_glb.
    for npz_path, fbx_path in candidates[:MAX_GLB_ATTEMPTS]:
        if build_asset_glb(obj_type, npz_path, output_dir,
                           lambda: load_scene(import_fbx, fbx_path, fps=fps)[0],
                           source_path=fbx_path):
            return
    if not candidates:
        record_glb_error(output_dir, obj_type,
                         f"'{obj_type}': no source FBX in the input for any of its "
                         f"{len(main)} main-skeleton clip(s); processed GLB not built")


def export_species(species, fbx_paths, output_dir, fps=30, dtype=np.float64,
                   min_frames=5, consider_parent_rotate=True, save_vis=True,
                   save_glb=False, glb_only=False):
    """Export one species: extract each of its per-clip FBX files, then prune
    the skeleton jointly across all clips and save them. ``save_glb`` also
    writes the species' processed GLB, ``glb_only`` only that (module
    docstring)."""

    obj_type = sanitize_object_type(species)

    if glb_only:
        # Existing NPZs only, markers or not; never (re-)exports.
        if asset_glb_missing(output_dir, obj_type):
            save_species_glb(obj_type, fbx_paths, output_dir, fps=fps)
        return {}

    if is_asset_complete(output_dir, obj_type):
        if save_glb and asset_glb_missing(output_dir, obj_type):
            logger.info(f"Species '{obj_type}' already exported; adding its processed GLB.")
            save_species_glb(obj_type, fbx_paths, output_dir, fps=fps)
        else:
            logger.info(f"Species '{obj_type}' already complete, skipping.")
        return {}
    remove_asset_glb(output_dir, obj_type)
    motion_save_dir = os.path.join(output_dir, "motions")
    existing = sorted(Path(motion_save_dir).glob(f"{obj_type}-*.npz")) if os.path.isdir(motion_save_dir) else []
    if existing:
        # Pruning is joint across all of a species' clips, so a partial
        # (or pre-marker) export must be redone as a whole.
        logger.warning(f"'{obj_type}' has {len(existing)} clip(s) but no completion "
                       f"marker (partial or pre-marker export); re-exporting; the old clips go to "
                       f"{REPLACED_DIR}/.")
        set_aside_old_clips(output_dir, obj_type)

    # A few species ship rig variants (different node counts or container
    # names — e.g. KingCobra's extra Null, Monkey's A01/B01/B02 containers).
    # prune_skeleton_shared requires identical topology across its inputs, so
    # clips are grouped by joint-name signature and each group is pruned
    # separately. The dominant group defines the species' joint_names entry
    # and rest-pose PNG.
    groups = {}  # names signature -> {'rest_anim', 'skin_matrix', 'extracted'}
    import_failures = []
    for fbx_path in fbx_paths:
        stem = Path(fbx_path).stem
        species_part, sep, action_name = stem.partition('-')
        if not sep:
            # Without the separator there is no action name; skipping one file
            # beats aborting the whole species on an IndexError.
            logger.warning(f"Skipping {fbx_path}: filename has no '-' separating "
                           f"species from action (expected "
                           f"'{{Species}}-{{Action}}.fbx').")
            continue

        try:
            result = extract_single_fbx(fbx_path, fps=fps, dtype=dtype)
        except Exception as e:  # noqa: BLE001 — finish the species, then fail it
            logger.warning(f"Failed to extract {fbx_path}: {e}")
            import_failures.append(f"{os.path.basename(fbx_path)}: {e}")
            continue

        nframes = result['anim'].positions.shape[0]
        if nframes < min_frames:
            logger.info(f"Skipping {fbx_path}: only {nframes} frames "
                        f"(min={min_frames})")
            continue

        sig = tuple(result['names'])
        group = groups.setdefault(sig, {
            'rest_anim':   result['rest_anim'],
            'names':       list(result['names']),
            'skin_matrix': result['skin_matrix'],
            'extracted':   [],
        })
        group['extracted'].append((action_name, result['anim']))

    saved = {}
    if groups:
        by_size = sorted(groups.values(), key=lambda g: len(g['extracted']),
                         reverse=True)
        if len(by_size) > 1:
            logger.warning(f"'{obj_type}' has {len(by_size)} rig variants "
                           f"(clip counts: {[len(g['extracted']) for g in by_size]}); "
                           f"pruning each separately.")
        for i, group in enumerate(by_size):
            logger.info(f"Extracted {len(group['extracted'])} animations for "
                        f"'{obj_type}' (variant {i})")
            result = postprocess_and_save(
                obj_type, group['extracted'],
                group['rest_anim'], group['names'], group['skin_matrix'],
                output_dir, fps=fps,
                consider_parent_rotate=consider_parent_rotate, save_vis=save_vis,
                save_tpose=(i == 0),
            )
            if i == 0:
                saved = result
    else:
        logger.info(f"No valid FBX files extracted for '{obj_type}'; skipping.")

    if import_failures:
        # No completion marker: a rerun redoes the species with every clip
        # (pruning is joint across them), and the batch exits non-zero.
        raise RuntimeError(f"{len(import_failures)} of {len(fbx_paths)} clip(s) of "
                           f"'{obj_type}' failed to extract: " + '; '.join(import_failures))
    mark_asset_complete(output_dir, obj_type,
                        status="exported" if saved else "skipped",
                        joint_names=saved.get(obj_type))
    # After the marker, on the skeleton this run saved as the species' own
    # (joint_names.json is only rewritten at the end of the run): a failure is
    # recorded, not raised, and a rerun with --glb_only adds the missing GLB.
    if save_glb and saved:
        save_species_glb(obj_type, fbx_paths, output_dir, fps=fps, want=saved[obj_type])
    return saved


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Export Truebones FBX clips to NPZ motion data.")
    parser.add_argument('--data_dir', type=str, required=True,
                        help='Flat directory of per-clip {Species}-{Action}.fbx files.')
    parser.add_argument('--output_dir', type=str, required=True,
                        help='Output directory (motions/, videos/, tpose/ created inside).')
    parser.add_argument('--fps', type=int, default=30,
                        help='Scene FPS for import and export (dataset is 30 fps).')
    parser.add_argument('--min_frames', type=int, default=5,
                        help='Skip clips shorter than this many frames '
                             '(shared minimum across all dataset exporters).')
    parser.add_argument('--consider_parent_rotate', action=argparse.BooleanOptionalAction, default=True,
                        help="Preserve non-rotating leaves whose parent rotates during pruning "
                             "(see prune_skeleton_shared; use --no-consider_parent_rotate to disable).")
    parser.add_argument('--vis', action=argparse.BooleanOptionalAction, default=True,
                        help="Render the per-clip MP4 preview (use --no-vis for bulk runs).")
    parser.add_argument('--save_glb', action='store_true',
                        help="Also write rigs/<species>.glb: the species in its rest pose on the "
                             "pruned skeleton (no animation; the clip NPZs drive it), for "
                             "mesh_animation. On an existing export, only the missing GLBs are added.")
    parser.add_argument('--glb_only', action='store_true',
                        help="Only add missing rigs/<species>.glb to an existing export, for the "
                             "species whose NPZs are already in motions/: no NPZ, completion marker "
                             "or summary JSON is written, and none is required.")
    parser.add_argument('--worker_id', type=int, default=0,
                        help="Worker index when sharding species across processes "
                             "(--glb_only only).")
    parser.add_argument('--num_workers', type=int, default=1,
                        help="Total number of workers (--glb_only only: a full export writes "
                             "one set of summary JSONs, so it stays single-process).")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def main():
    args = parse_args()
    if args.num_workers > 1 and not args.glb_only:
        raise SystemExit("--num_workers > 1 needs --glb_only: a full Truebones export "
                         "is single-process (it writes one set of summary JSONs).")

    fbx_files = sorted(f for f in os.listdir(args.data_dir) if f.lower().endswith('.fbx'))
    by_species = {}
    for f in fbx_files:
        species = os.path.splitext(f)[0].split('-', 1)[0]
        by_species.setdefault(species, []).append(os.path.join(args.data_dir, f))
    logger.info(f"Found {len(fbx_files)} clips across {len(by_species)} species "
                f"in {args.data_dir}")

    os.makedirs(args.output_dir, exist_ok=True)
    error_log = os.path.join(args.output_dir, 'export_errors.log')
    all_joint_names = {}
    n_failed = 0
    species_items = sorted(by_species.items())
    if args.num_workers > 1:
        species_items = species_items[args.worker_id::args.num_workers]
        logger.info(f"Worker {args.worker_id}/{args.num_workers}: {len(species_items)} species")
    for species, fbx_paths in tqdm(species_items, desc="Exporting species"):
        try:
            saved = export_species(species, fbx_paths, output_dir=args.output_dir,
                                   fps=args.fps, min_frames=args.min_frames,
                                   consider_parent_rotate=args.consider_parent_rotate,
                                   save_vis=args.vis, save_glb=args.save_glb,
                                   glb_only=args.glb_only)
            if saved:
                all_joint_names.update(saved)
        except Exception as e:  # noqa: BLE001 — keep the batch going
            n_failed += 1
            logger.exception(f"Failed to export species {species}")
            with open(error_log, 'a') as log_file:
                log_file.write(f"Failed to export species {species}: {e}\n")

    if not args.glb_only:
        write_export_summary(args.output_dir, all_joint_names, fps=args.fps)
    if args.save_glb or args.glb_only:
        report_glb_errors(args.output_dir)
    if n_failed:
        logger.error(f"{n_failed}/{len(by_species)} species failed; see {error_log}")
        sys.exit(1)


if __name__ == "__main__":
    # Blender exits 0 even on an uncaught exception, which hides failures from
    # `set -e` and from Slurm's afterok dependencies.
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        logger.exception("export_truebones failed")
        sys.exit(1)
