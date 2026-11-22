"""Export rigged assets (GLB/GLTF or FBX) to NPZ motion data.

The exporter of the ``general`` dataset (extra training assets in
``dataset/raw/general/animation/``, see ``run_export.sh general``) and of any single
asset: ``--input`` is either a single file or a directory of
``.glb``/``.gltf``/``.fbx`` assets (mixed formats welcome). The importer is
picked per file by extension, the character mesh is optional, and every pose
action found in a file is exported as its own clip. Directory runs mirror the
Objaverse exporter: per-asset completion markers for resume, worker sharding,
a per-worker error log, per-worker summary shards (merge with
``data_process.tools.merge_summaries``), and assets listed in an
``excluded.csv`` beside or inside the directory are skipped.

``--save_glb`` also writes ``rigs/<asset>.glb`` per asset: the asset in its
rest pose on the pruned skeleton, without animation
(``processed_assets.export_asset_glb``); every clip NPZ of the asset drives it as a
character (``mesh_animation``). On an existing export it only adds the missing
GLBs (the NPZs are not rewritten). ``--glb_only`` does only that, also for an
export without completion markers (the released ones): it builds the missing
GLBs of the assets whose NPZs are already in ``motions/`` and writes nothing
else.

Asset names: clips are ``{asset}-{action}`` and the object type is the text
before the first ``-``, so the asset name is the file stem with ``-`` and
whitespace replaced by ``_`` (``blender_export.asset_name``); two files that
map to one name stop a directory run before anything is exported.

Pipeline: import scene → select armature (+ mesh if present) → discover
actions → build skeleton arrays → extract animations → optional skeleton
pruning → coordinate conversion → save per-action NPZ + MP4 visualization.

Behavior notes:
    - Mesh optional: with a mesh, skin weights are extracted from every mesh
      the armature deforms (``find_skinned_meshes``) and skeleton pruning is
      enabled by default; without one, ``skin_matrix`` is saved
      as an empty ``(0, nbones)`` array and pruning is skipped (the pruning
      passes rely on skin weights to decide which bones matter).
    - Actions: all relevant pose actions are exported, named after their
      glTF animation (the importer's ``_<armature>`` suffix is stripped, so
      ``eve.glb``'s animation ``alert`` is the clip ``eve-alert``). Files whose action
      does not pass the pose-action filter (e.g. Mixamo animation-only
      clips) fall back to the armature's single bound action
      (``blender_export.discover_clip_actions``, shared with render_general).
    - No joint-count filtering: stage 4 (feature_extraction --min_joints /
      --max_joints) decides which skeletons enter training.

Usage (Blender headless):
    blender -b -P data_process/motion_export/export_general.py -- \
        --input assets_dir --output_dir outputs/export

Usage (pip-installed bpy):
    python data_process/motion_export/export_general.py \
        --input assets/dragon.fbx --output_dir outputs/export
"""

import bpy
import sys
import json
import os
import numpy as np
import argparse
from pathlib import Path
from tqdm import tqdm
from loguru import logger

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from data_process.utils.blender_export import (
    GENERAL_ASSET_EXTS, import_fbx, import_gltf, sanitize_action_name, unique_clip_names,
    load_scene, prepare_skeleton, extract_all_actions, save_rest_pose_vis,
    prune_skeleton_shared, remove_tpose_frames, discover_clip_actions, find_skinned_meshes,
    save_motion, write_export_summary, asset_name, asset_names,
    list_asset_files, is_asset_complete, mark_asset_complete,
)
from data_process.utils.asset_files import (
    REPLACED_DIR, asset_glb_missing, remove_asset_glb, report_glb_errors, set_aside_old_clips,
)
from data_process.utils.processed_assets import add_asset_glb, build_asset_glb

GLTF_EXTS = {'.glb', '.gltf'}
FBX_EXTS = {'.fbx'}
ASSET_EXTS = set(GENERAL_ASSET_EXTS)
# Leaf bones named like this are a link's end point (a foot or tool tip),
# kept when their parent rotates, not control bones.
END_EFFECTOR_SUFFIXES = ('_tip',)


def pick_importer(path):
    """Return the importer matching *path*'s extension, or raise."""
    ext = Path(path).suffix.lower()
    if ext in GLTF_EXTS:
        return import_gltf
    if ext in FBX_EXTS:
        return import_fbx
    raise ValueError(f"Unsupported extension '{ext}' (expected one of "
                     f"{sorted(ASSET_EXTS)}): {path}")


def export_asset(input_path, output_dir, save_name=None, fps=30,
                 dtype=np.float64, prune=None, consider_parent_rotate=True,
                 min_frames=5, remove_tpose=True, save_vis=True, save_glb=False,
                 glb_only=False):
    """Export every pose action in a single GLB/GLTF/FBX file to NPZ clips.

    Args:
        save_name: Asset name / clip prefix (default: ``asset_name(input_path)``,
            the stem with ``-`` and whitespace replaced by ``_``). Must not
            contain ``-``.
        prune: True/False to force skeleton pruning on/off; None (default)
            enables it iff the file contains a skinned mesh.
        save_glb: Also write the asset's processed GLB (module docstring).
        glb_only: Only write that, for an asset already exported.

    Returns:
        {save_name: joint_names} when at least one clip was saved, else {}.
    """
    assert os.path.exists(input_path), f"Input file not found: {input_path}"
    save_name = save_name or asset_name(input_path)
    if '-' in save_name:
        raise ValueError(f"Asset name '{save_name}' contains '-', the separator between "
                         f"asset and action in clip names; pick another name.")

    if glb_only:
        # Existing NPZs only, markers or not; never (re-)exports.
        if asset_glb_missing(output_dir, save_name):
            add_asset_glb(save_name, output_dir,
                          lambda: load_scene(pick_importer(input_path), input_path, fps=fps)[0],
                          source_path=input_path)
        return {}

    motion_save_dir = os.path.join(output_dir, "motions")
    vis_save_dir = os.path.join(output_dir, "videos")
    tpos_save_dir = os.path.join(output_dir, "tpose")

    if is_asset_complete(output_dir, save_name):
        if not (save_glb and asset_glb_missing(output_dir, save_name)):
            logger.info(f"Asset '{save_name}' already complete, skipping: {input_path}")
            return {}
        logger.info(f"Asset '{save_name}' already exported; adding its processed GLB")
        add_asset_glb(save_name, output_dir,
                      lambda: load_scene(pick_importer(input_path), input_path, fps=fps)[0],
                      source_path=input_path)
        return {}
    remove_asset_glb(output_dir, save_name)
    existing = sorted(Path(motion_save_dir).glob(f"{save_name}-*.npz")) if os.path.isdir(motion_save_dir) else []
    if existing:
        # Pruning is joint across all of an asset's clips, so a partial
        # (or pre-marker) export must be redone as a whole.
        logger.warning(f"'{save_name}' has {len(existing)} clip(s) but no completion "
                       f"marker (partial or pre-marker export); re-exporting; the old clips go to "
                       f"{REPLACED_DIR}/.")
        set_aside_old_clips(output_dir, save_name)

    logger.info(f"Processing asset: {input_path}")
    os.makedirs(motion_save_dir, exist_ok=True)
    os.makedirs(vis_save_dir, exist_ok=True)

    armature, mesh = load_scene(pick_importer(input_path), input_path, fps=fps)
    if mesh is None:
        logger.info(f"No mesh in {input_path}; exporting armature only "
                    f"(empty skin matrix, pruning {'forced on' if prune else 'off'}).")
    if prune is None:
        prune = mesh is not None

    # All relevant pose actions; fall back to the armature's bound action
    # for single-action files that the pose filter rejects.
    action_names, frame_ranges = discover_clip_actions(armature)
    logger.info(f"Total actions to export: {len(action_names)}")
    if not action_names:
        logger.info(f"No actions in {input_path}; skipping.")
        mark_asset_complete(output_dir, save_name, status="skipped",
                            reason="no pose actions")
        return {}

    # Skin weights of every mesh the armature deforms, not only the largest:
    # a rig built from one skinned mesh per part would otherwise look
    # unskinned and lose its moving links to pruning.
    skin_meshes = find_skinned_meshes(armature) or ([mesh] if mesh is not None else [])
    skel = prepare_skeleton(armature, skin_meshes or None, dtype=dtype, apply_world=True)
    extracted = extract_all_actions(
        armature, {n: frame_ranges[n] for n in action_names},
        skel['rest_local_pos'], skel['parents_array'],
        skel['rest_anim'], skel['nbones'], dtype=dtype,
    )

    anims_list = [anim for _, anim in extracted]
    rest_anim_shared = skel['rest_anim_shared']
    names = list(skel['bone_names'])
    skin_matrix = skel['skin_matrix']
    if prune:
        anims_list, rest_anim_shared, names, skin_matrix = prune_skeleton_shared(
            anims_list, rest_anim_shared, names, skin_matrix.copy(),
            consider_parent_rotate=consider_parent_rotate,
            end_effector_suffixes=END_EFFECTOR_SUFFIXES,
        )

    save_rest_pose_vis(tpos_save_dir, save_name, rest_anim_shared)

    # Distinct actions can sanitize to the same name and would then overwrite
    # each other's NPZ; disambiguate over the full discovered list.
    clip_suffixes = unique_clip_names(action_names)

    scene_fps = bpy.context.scene.render.fps
    saved_clips = []
    for i, (action_name, _) in enumerate(extracted):
        anim = anims_list[i]

        if remove_tpose:
            anim, n_tpose = remove_tpose_frames(anim, rest_anim_shared)
            if n_tpose > 0:
                logger.info(f"Removed {n_tpose} T-pose frames from '{action_name}', "
                            f"{anim.positions.shape[0]} frames remaining")
        if anim.positions.shape[0] < min_frames:
            logger.info(f"Skipping '{action_name}': only {anim.positions.shape[0]} frames "
                        f"(min={min_frames})")
            continue

        clip_name = f"{save_name}-{clip_suffixes.get(action_name) or sanitize_action_name(action_name) or 'action'}"
        save_motion(
            os.path.join(motion_save_dir, f"{clip_name}.npz"),
            os.path.join(vis_save_dir, f"{clip_name}.mp4"),
            anim, rest_anim_shared, names, skin_matrix, scene_fps,
            action_name=action_name, save_vis=save_vis,
        )
        saved_clips.append(clip_name)

    mark_asset_complete(output_dir, save_name,
                        status="exported" if saved_clips else "skipped",
                        n_clips=len(saved_clips),
                        reason=None if saved_clips else "no clips survived filtering",
                        joint_names=names if saved_clips else None)
    # After the marker, from a clip this run saved and a fresh import (the
    # scene now sits at the last extracted frame, and an animated armature
    # object or parent empty would carry that pose): exactly what --glb_only
    # builds. A failure is recorded, not raised.
    if save_glb and saved_clips:
        build_asset_glb(save_name, os.path.join(motion_save_dir, f"{saved_clips[0]}.npz"),
                        output_dir,
                        lambda: load_scene(pick_importer(input_path), input_path, fps=fps)[0],
                        source_path=input_path)
    logger.info(f"Saved {len(saved_clips)} clip(s) for '{save_name}'")
    if saved_clips:
        return {save_name: names}
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def check_other_datasets(names, output_dir):
    """Refuse asset names another training dataset already uses, before any
    work: an export into the general dataset (``<export>/general``) whose
    asset is a Truebones or Objaverse object type (their ``joint_names.json``
    beside it), or ``mixamo`` / ``mixamo_*`` (Mixamo's clip keys are
    ``mixamo_<clip>``), would collide in the training loader's one namespace."""
    root, ds = os.path.split(os.path.abspath(output_dir.rstrip(os.sep)))
    if ds != 'general':
        return
    taken = {}
    for other in ('truebones', 'objaverse'):
        path = os.path.join(root, other, 'joint_names.json')
        if os.path.isfile(path):
            with open(path) as f:
                taken.update({n: other for n in json.load(f)})
    clashes = sorted(f"{n} ({taken[n]})" if n in taken else f"{n} (mixamo clip keys)"
                     for n in set(names)
                     if n in taken or n == 'mixamo' or n.startswith('mixamo_'))
    if clashes:
        raise ValueError(f"{len(clashes)} general asset name(s) are used by another dataset "
                         f"(rename the files): {clashes[:10]}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Export rigged GLB/GLTF/FBX assets (a file or a directory) "
                    "to NPZ motion data.")
    parser.add_argument('--input', type=str, required=True,
                        help='A .glb/.gltf/.fbx file, or a directory of them.')
    parser.add_argument('--output_dir', type=str, required=True,
                        help='Output directory (motions/, videos/, tpose/ created inside).')
    parser.add_argument('--name', type=str, default=None,
                        help="Save name / clip prefix (single-file input only; "
                             "default: input file stem with '-' and whitespace "
                             "replaced by '_').")
    parser.add_argument('--fps', type=int, default=30)
    parser.add_argument('--prune', action=argparse.BooleanOptionalAction, default=None,
                        help='Force skeleton pruning on/off '
                             '(default: on iff the file has a skinned mesh).')
    parser.add_argument('--consider_parent_rotate', action=argparse.BooleanOptionalAction, default=True,
                        help='Preserve non-rotating leaves whose parent rotates (see prune_skeleton_shared).')
    parser.add_argument('--min_frames', type=int, default=5,
                        help='Skip clips shorter than this many frames '
                             '(shared minimum across all dataset exporters).')
    parser.add_argument('--keep_tpose_frames', action='store_true',
                        help='Keep frames matching the rest pose instead of removing them.')
    parser.add_argument('--vis', action=argparse.BooleanOptionalAction, default=True,
                        help='Render the per-clip MP4 preview (use --no-vis for bulk runs).')
    parser.add_argument('--save_glb', action='store_true',
                        help="Also write rigs/<asset>.glb: the asset in its rest pose on the "
                             "pruned skeleton (no animation; the clip NPZs drive it), for "
                             "mesh_animation. On an existing export, only the missing GLBs are added.")
    parser.add_argument('--glb_only', action='store_true',
                        help="Only add missing rigs/<asset>.glb to an existing export, for the "
                             "assets whose NPZs are already in motions/: no NPZ, completion marker "
                             "or summary JSON is written, and none is required.")
    parser.add_argument('--worker_id', type=int, default=0,
                        help='Worker index for sharding files across workers (directory input).')
    parser.add_argument('--num_workers', type=int, default=1,
                        help='Total number of workers (directory input).')

    # Blender passes script args after "--"; plain python passes them directly.
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def main():
    args = parse_args()
    export_kwargs = dict(
        fps=args.fps, prune=args.prune,
        consider_parent_rotate=args.consider_parent_rotate,
        min_frames=args.min_frames, remove_tpose=not args.keep_tpose_frames,
        save_vis=args.vis, save_glb=args.save_glb, glb_only=args.glb_only,
    )

    if os.path.isdir(args.input):
        asset_paths = list_asset_files(args.input)
        assert asset_paths, f"No {sorted(ASSET_EXTS)} files found in {args.input}"
        logger.info(f"Found {len(asset_paths)} asset files in {args.input}")
        # Checked over the full list, before sharding, so every worker agrees.
        names = asset_names(asset_paths)
        check_other_datasets(names.values(), args.output_dir)

        if args.num_workers > 1:
            asset_paths = asset_paths[args.worker_id::args.num_workers]
            logger.info(f"Worker {args.worker_id}/{args.num_workers}: "
                        f"processing {len(asset_paths)} files")

        os.makedirs(args.output_dir, exist_ok=True)
        error_log = os.path.join(args.output_dir,
                                 f'export_errors_worker{args.worker_id}.log')
        all_joint_names = {}
        n_failed = 0
        for asset_path in tqdm(asset_paths, desc="Exporting assets"):
            try:
                saved = export_asset(str(asset_path), args.output_dir,
                                     save_name=names[asset_path], **export_kwargs)
                if saved:
                    all_joint_names.update(saved)
            except Exception as e:  # noqa: BLE001 — keep the batch going
                n_failed += 1
                logger.exception(f"Failed to export {asset_path}")
                with open(error_log, 'a') as log_file:
                    log_file.write(f"Failed to export {asset_path}: {e}\n")

        if not args.glb_only:
            worker_suffix = f"_worker{args.worker_id}" if args.num_workers > 1 else ""
            write_export_summary(args.output_dir, all_joint_names, fps=args.fps,
                                 worker_suffix=worker_suffix)

        # Summaries are written first so a partial batch still leaves the
        # canonical JSONs consistent; the non-zero exit then tells the
        # wrapper not to merge shards and Slurm afterok chains to stop.
        if args.save_glb or args.glb_only:
            report_glb_errors(args.output_dir)
        if n_failed:
            logger.error(f"{n_failed}/{len(asset_paths)} assets failed; "
                         f"see {error_log}")
            sys.exit(1)
    else:
        check_other_datasets([args.name or asset_name(args.input)], args.output_dir)
        saved = export_asset(args.input, args.output_dir, save_name=args.name,
                             **export_kwargs)
        if saved and not args.glb_only:
            write_export_summary(args.output_dir, saved, fps=args.fps)
        if args.save_glb or args.glb_only:
            report_glb_errors(args.output_dir)


if __name__ == "__main__":
    # Blender exits 0 even on an uncaught exception, which hides failures from
    # `set -e` and from Slurm's afterok dependencies.
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        logger.exception("export_general failed")
        sys.exit(1)
