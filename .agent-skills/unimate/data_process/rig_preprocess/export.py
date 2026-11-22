"""Stage 1 for one asset: export NPZs and the processed rest-pose GLB (bpy).

An animated asset goes through its profile's own exporter, so its NPZs are
what the dataset export wrote. An asset without animation gets the same
skeleton steps (import, secondary-root pruning, world-applied rest, Z-up ->
Y-up) and one placeholder clip holding the rest pose, ``<name>-rest_pose``,
so every later stage reads the usual export NPZ. Its skeleton is pruned by
the motion-free rules only (control-bone names, bones on their parent's
origin, unskinned single-child roots); the rules that need animation (static
leaves, stretching leaves, bones that never rotate) cannot be decided, so
unskinned bones that would fall to them (``*_End``, ``*Nub``, finger tips,
controllers) are kept. Treating the still pose as motion instead would prune
unskinned bones that an animated asset's clips do move.
"""

import os
from pathlib import Path

import numpy as np
from loguru import logger

from Animation import Animation
from Quaternions import Quaternions

from data_process.motion_export import export_general, export_objaverse, export_truebones
from data_process.utils.blender_export import (
    find_skinned_meshes,
    import_fbx,
    import_gltf,
    load_scene,
    mark_asset_complete,
    prepare_skeleton,
    prune_skeleton_shared,
    sanitize_object_type,
    save_motion,
)
from data_process.rig_preprocess.profiles import IMPORTER_EXTS
from data_process.utils.processed_assets import build_asset_glb

# The placeholder clip of an asset without animation.
REST_CLIP = 'rest_pose'
# Frames in that clip; any count works, stage 4 trims it as static.
REST_CLIP_FRAMES = 2


def asset_key(profile, inputs):
    """The asset name the profile's exporter gives *inputs* (also the object type)."""
    exts = IMPORTER_EXTS[profile.importer]
    for p in inputs:
        if Path(p).suffix.lower() not in exts:
            raise ValueError(f"profile '{profile.name}' reads {'/'.join(exts)} files, got {p}")
    if profile.exporter == 'truebones':
        species = {Path(p).stem.split('-', 1)[0] for p in inputs}
        if len(species) != 1:
            raise ValueError(f"truebones inputs must be clips of one species, got {sorted(species)}")
        return sanitize_object_type(species.pop())
    if len(inputs) != 1:
        raise ValueError(f"profile '{profile.name}' takes one asset file, got {len(inputs)}")
    return export_general.asset_name(inputs[0])


def _importer(profile, path):
    if profile.importer == 'gltf':
        return import_gltf
    if profile.importer == 'fbx':
        return import_fbx
    return export_general.pick_importer(path)


def _has_bound_action(profile, path, fps):
    """Whether the file's armature carries an action (a Truebones clip FBX does)."""
    armature, _ = load_scene(_importer(profile, path), path, fps=fps)
    data = armature.animation_data
    return data is not None and data.action is not None


def export_animated(profile, inputs, export_dir, name, fps=30):
    """Run the profile's exporter. Returns the joint names, or None when the
    asset has no clip (no pose action, or none long enough)."""
    if profile.exporter == 'objaverse':
        saved = export_objaverse.export_objaverse(inputs[0], name, export_dir, fps=fps,
                                                  save_vis=False)
    elif profile.exporter == 'general':
        saved = export_general.export_asset(inputs[0], export_dir, save_name=name, fps=fps,
                                            remove_tpose=profile.remove_tpose, save_vis=False)
    elif profile.exporter == 'truebones':
        if len(inputs) == 1 and not _has_bound_action(profile, inputs[0], fps):
            return None        # a rigged FBX without animation: the static path
        species = Path(inputs[0]).stem.split('-', 1)[0]
        saved = export_truebones.export_species(species, list(inputs), export_dir, fps=fps,
                                                save_vis=False)
    else:
        raise ValueError(f"unknown exporter {profile.exporter!r}")
    return saved.get(name)


def export_static(profile, path, export_dir, name, fps=30):
    """Export an asset without animation as one rest-pose clip. Returns the joint names."""
    armature, mesh = load_scene(_importer(profile, path), path, fps=fps)
    if profile.all_skinned_meshes:
        meshes = find_skinned_meshes(armature) or ([mesh] if mesh is not None else [])
        skel = prepare_skeleton(armature, meshes or None, apply_world=True)
    else:
        if mesh is None:
            raise ValueError(f"no mesh in {path}; profile '{profile.name}' needs one")
        skel = prepare_skeleton(armature, mesh, apply_world=True)

    rest = skel['rest_anim_shared']
    clip = Animation(
        rotations=Quaternions(np.repeat(rest.rotations.qs, REST_CLIP_FRAMES, axis=0)),
        positions=np.repeat(rest.positions, REST_CLIP_FRAMES, axis=0),
        orients=rest.orients.copy(), offsets=rest.offsets.copy(),
        parents=rest.parents.copy())
    names = list(skel['bone_names'])
    skin_matrix = skel['skin_matrix']
    if mesh is not None:
        # With a still clip the position rules reduce to the rest-pose ones,
        # and rot_eps=0 switches off the rotation rule, which would otherwise
        # prune every unskinned bone as never moving (also ones the clips
        # move, such as a Mixamo rig's unskinned legs; see the module docstring).
        anims, rest, names, skin_matrix = prune_skeleton_shared(
            [clip], rest, names, skin_matrix.copy(), rot_eps=0.0,
            end_effector_suffixes=profile.end_effector_suffixes)
        clip = anims[0]

    clip_name = f'{name}-{REST_CLIP}'
    save_motion(os.path.join(export_dir, 'motions', f'{clip_name}.npz'),
                os.path.join(export_dir, 'videos', f'{clip_name}.mp4'),
                clip, rest, names, skin_matrix, fps, action_name=REST_CLIP, save_vis=False)
    mark_asset_complete(export_dir, name, n_clips=1, joint_names=names)
    logger.info(f"'{name}' has no animation: exported its rest pose as '{clip_name}' "
                f"({len(names)} joints, motion-free pruning)")
    return names


def build_processed_glb(profile, inputs, export_dir, name, names, animated=True, fps=30):
    """``<export_dir>/rigs/<name>.glb``, as ``--save_glb`` builds it; after any
    rest-orientation patch, which the GLB follows. A static asset builds it
    from its one file and rest-pose clip. Returns its path or None."""
    if profile.exporter == 'truebones' and animated:
        export_truebones.save_species_glb(name, list(inputs), export_dir, fps=fps, want=names)
    else:
        clips = sorted((Path(export_dir) / 'motions').glob(f'{name}-*.npz'))
        build_asset_glb(name, str(clips[0]), export_dir,
                        lambda: load_scene(_importer(profile, inputs[0]), inputs[0], fps=fps)[0],
                        source_path=inputs[0])
    path = os.path.join(export_dir, 'rigs', f'{name}.glb')
    return path if os.path.isfile(path) else None
