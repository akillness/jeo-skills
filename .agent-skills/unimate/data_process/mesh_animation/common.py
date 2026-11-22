"""Shared plumbing for the mesh-animation entry points.

Every entry script in this package runs under Blender headless
(``blender -b -P <script>.py -- <args>``), loads a rigged character, binds a
driving animation onto its armature, and exports GLB/FBX. They differ only in
where the driving animation comes from:

    animate_motion   feature NPZ (or model-feature ``.npy``) + ``cond.npy``
    animate_npz      export-stage NPZ (bone names carried in the file)
    animate_lbs      either NPZ, deformed with NumPy LBS (cond-free on a
                     canonical asset)
    animate_fbx      raw animation FBX/GLB clips (action transfer by name)
    animate_mixamo   batch wrapper over ``animate_npz``

This module holds the pieces they share: Blender-style CLI parsing, the
processed-asset lookup (``ASSET_DIR_TEMPLATES``), character loading, the
keyframe-and-export core (with the bone-axis alignment of
:func:`data_process.utils.skeleton.motion_axis_alignment`), and the
error-logged batch loop. Rig primitives (keyframe math, armature
reconciliation, exporters) stay in :mod:`data_process.utils.blender_rig`.
"""

import json
import os
import sys

import numpy as np
from loguru import logger
from tqdm import tqdm

from Animation import Quaternions, transforms_global, transforms_local

from data_process.utils.asset_files import (
    CANONICAL_ASSETS_DIR,
    CANONICAL_ORDER_KEY,
    DEFAULT_MIXAMO_CHARACTER,
    PROCESSED_GLB_DIR,
)
from data_process.utils.blender_export import reset_scene
from data_process.utils.blender_rig import (
    compute_bone_keyframes,
    export_animated_character,
    get_armature_obj,
    load_file,
    rebuild_action_from_data,
    repair_and_pack_textures,
    set_scene_timing,
    sync_armature_bones,
    update_scene,
)
from data_process.utils.skeleton import motion_axis_alignment
from mathutils import Matrix  # after bpy (imported above): the pip module registers it

ERROR_LOG_NAME = 'animate_errors.log'
# drive_and_export refuses a character holding fewer of the motion's joints
# than this share: it is the wrong character for the motion.
MIN_JOINT_MATCH = 0.5

# Processed assets (repo-relative, run from the repo root):
#   export     dataset/export/<ds>/rigs/<name>.glb   rest pose on the exported
#              skeleton (run_export.sh --save_glb / --glb_only); driven by the
#              export NPZs, or by feature motions through the cond
#   canonical  dataset/canonical_assets/<ds>/<name>.glb   the same in the stage-4
#              canonical frame (feature_extraction/canonical_assets.py); driven
#              by feature NPZs with no cond
# <name> is the object type (the motion file's prefix before the first '-');
# Mixamo clips carry none, so its assets are characters (default Michelle; any
# character of CHAR_DIR / canonical_assets/mixamo can be chosen).
ASSET_DIR_TEMPLATES = {
    'export': os.path.join('dataset', 'export', '{dataset_type}', PROCESSED_GLB_DIR),
    'canonical': os.path.join('dataset', CANONICAL_ASSETS_DIR, '{dataset_type}'),
}


# ---------------------------------------------------------------------------
# CLI / small helpers
# ---------------------------------------------------------------------------

def parse_blender_argv(parser):
    """Parse CLI args for a script run via ``blender -b -P script.py -- <args>``.

    Blender consumes everything before the ``--`` separator; only what
    follows belongs to the script. Plain ``python script.py <args>`` (no
    separator) also works, so the entry points run under pip ``bpy`` too.
    """
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def npz_scalar(data, key, default):
    """Read a scalar from an NpzFile / dict, falling back to *default*.

    Mapping-free inputs (e.g. the model-feature ``.npy`` ndarray in
    ``animate_motion``) have no keys and always yield *default*.
    """
    if hasattr(data, 'keys') and key in data:
        return float(data[key])
    return default


def motion_asset_name(anim_path, dataset_type, character=None):
    """Name of the processed asset a motion file belongs to (see ASSET_DIR_TEMPLATES)."""
    if dataset_type == 'mixamo':
        return character or DEFAULT_MIXAMO_CHARACTER
    if character:
        # Elsewhere a clip drives only its own object type's skeleton.
        raise ValueError(f"a character is chosen for mixamo only (dataset_type={dataset_type!r}); "
                         "pass the asset file as --char_path")
    return os.path.basename(anim_path).split('-')[0]


def processed_asset_path(anim_path, dataset_type, kind='export', character=None):
    """Where the processed GLB of the motion's asset lives (*kind* 'export' or
    'canonical'; see ``ASSET_DIR_TEMPLATES``), whether or not it exists."""
    return os.path.join(ASSET_DIR_TEMPLATES[kind].format(dataset_type=dataset_type),
                        motion_asset_name(anim_path, dataset_type, character) + '.glb')


def find_processed_asset(anim_path, dataset_type, kind='export', character=None):
    """The processed GLB of the motion's asset, or None when it has not been written."""
    path = processed_asset_path(anim_path, dataset_type, kind, character)
    return path if os.path.isfile(path) else None


def resolve_processed_asset(anim_path, dataset_type, kind='export', character=None):
    """:func:`find_processed_asset`, or FileNotFoundError saying how to build it."""
    path = find_processed_asset(anim_path, dataset_type, kind, character)
    if path is None:
        build = (f"run_export.sh {dataset_type} --glb_only" if kind == 'export'
                 else "feature_extraction/canonical_assets.py")
        raise FileNotFoundError(
            f"No processed {kind} asset {processed_asset_path(anim_path, dataset_type, kind, character)} "
            f"for {anim_path!r}: build it ({build}) or pass --char_path")
    logger.info(f"Using the processed {kind} asset: {path}")
    return path


def canonical_joint_order(armature):
    """The joint order a canonical asset stores (``canonical_joint_order``
    custom property, a JSON list in glTF extras), or None."""
    order = armature.get(CANONICAL_ORDER_KEY) or armature.data.get(CANONICAL_ORDER_KEY)
    if not order:
        return None
    if isinstance(order, str):
        order = json.loads(order)
    return [str(n) for n in order]


def is_canonical_asset(armature):
    """True for an asset baked to the stage-4 canonical frame (it carries the
    ``canonical_joint_order`` custom property: canonical_assets.py,
    rig_preprocess)."""
    return canonical_joint_order(armature) is not None


def check_canonical_order(armature, joint_names, source):
    """Raise when a canonical asset was baked from another skeleton than the
    motion's: index j of the motion must be its stored joint j."""
    order = canonical_joint_order(armature)
    names = [str(n) for n in joint_names]
    if order is not None and order != names:
        diff = next((i for i, (a, b) in enumerate(zip(order, names)) if a != b),
                    min(len(order), len(names)))
        raise ValueError(
            f"the canonical asset's joint order ({len(order)} joints) is not the motion's "
            f"({len(names)} joints, from {source}); first difference at joint {diff}. "
            f"The asset was baked from another cond: rebuild it, or use the cond it was "
            f"baked from.")


def is_feature_motion(anim_path):
    """Stage-4 feature format: an NPZ with ``local_rotations`` (and
    ``global_positions``), as opposed to an export NPZ or model ``.npy``."""
    if not anim_path.endswith('.npz'):
        return False
    with np.load(anim_path, allow_pickle=True) as data:
        return 'local_rotations' in data.files


def clip_output_path(anim_path, output_dir, ext=None):
    """``<output_dir>/<clip stem>[.<ext>]`` for a driving-animation file."""
    base = os.path.splitext(os.path.basename(anim_path))[0]
    return os.path.join(output_dir, base + (f'.{ext}' if ext else ''))


def rotations_to_quats(rotations):
    """``(J, 3, 3)`` rotation matrices -> ``(J, 4)`` wxyz quaternions, through
    mathutils (``Quaternions.from_transforms`` returns the inverse when two
    components tie, e.g. for an exact -90 deg turn)."""
    return np.array([tuple(Matrix(r.tolist()).to_quaternion()) for r in rotations])


def quat_pos_to_mats(q, pos):
    """Batch (…, 4) wxyz quaternions + (…, 3) translations -> (…, 4, 4)."""
    q = q / np.linalg.norm(q, axis=-1, keepdims=True)
    w, x, y, z = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    m = np.zeros(q.shape[:-1] + (4, 4))
    m[..., 0, 0] = 1 - 2 * (y * y + z * z)
    m[..., 0, 1] = 2 * (x * y - w * z)
    m[..., 0, 2] = 2 * (x * z + w * y)
    m[..., 1, 0] = 2 * (x * y + w * z)
    m[..., 1, 1] = 1 - 2 * (x * x + z * z)
    m[..., 1, 2] = 2 * (y * z - w * x)
    m[..., 2, 0] = 2 * (x * z - w * y)
    m[..., 2, 1] = 2 * (y * z + w * x)
    m[..., 2, 2] = 1 - 2 * (x * x + y * y)
    m[..., :3, 3] = pos
    m[..., 3, 3] = 1.0
    return m


# ---------------------------------------------------------------------------
# Character loading
# ---------------------------------------------------------------------------

def load_character(char_path, pack_textures=True):
    """Reset the scene, import the character file and return its armature.

    ``pack_textures`` re-links missing texture files found next to the
    character and packs images into memory so the exporters don't silently
    drop them (see :func:`repair_and_pack_textures`).
    """
    assert os.path.exists(char_path), f"Character file not found: {char_path}"
    reset_scene()
    armature = get_armature_obj(load_file(char_path))
    assert armature is not None, f"No armature found in character file: {char_path}"
    if pack_textures:
        repair_and_pack_textures(char_path)
    return armature


# ---------------------------------------------------------------------------
# Keyframe-and-export core (shared by animate_motion / animate_npz)
# ---------------------------------------------------------------------------

def drive_and_export(char_armature, anim, rest_anim, bone_names, fps,
                     output_path_no_ext, formats=('glb',),
                     extra_bones_strategy='merge', tpos_global_rot=None):
    """Bind an ``(anim, rest_anim)`` pair onto the armature and export.

    Args:
        char_armature: The character's ARMATURE object (see
            :func:`load_character`).
        anim: ``Animation`` with the animated local transforms.
        rest_anim: Single-frame ``Animation`` with the rest pose the
            character's bind pose corresponds to.
        bone_names: Bone names, index-aligned with the animations.
        fps: Scene frame rate for the export.
        output_path_no_ext: Output path without extension.
        formats: Iterable of export formats (``'glb'`` / ``'fbx'``).
        extra_bones_strategy: How to treat armature bones absent from
            *bone_names* (see :func:`sync_armature_bones`).
        tpos_global_rot: Optional ``(nbones, 4)`` T-pose global rotations to
            conjugate keyframes by (``.npy`` model-feature path in animate_motion).
            When the rig's bone axes differ from the motion's
            (:func:`motion_axis_alignment`), the conjugation also re-expresses
            the keys in the rig's axes.
    """
    anim_local_mat = transforms_local(anim)          # (nframes, nbones, 4, 4)
    rest_local_mat = transforms_local(rest_anim)[0]  # (nbones, 4, 4)

    sync_armature_bones(char_armature, bone_names,
                        extra_bones_strategy=extra_bones_strategy)
    present = {b.name for b in char_armature.data.bones}
    matched = sum(str(n) in present for n in bone_names)
    if matched < MIN_JOINT_MATCH * len(bone_names):
        raise ValueError(
            f"the character has only {matched} of the motion's {len(bone_names)} joints; "
            f"it is not the character this motion was made for")
    set_scene_timing(anim_local_mat.shape[0], fps)

    # The rig's bone axes may differ from the motion's (motion_axis_alignment).
    bones = char_armature.data.bones
    tpos_rot = None if tpos_global_rot is None else \
        Quaternions(np.asarray(tpos_global_rot)).transforms()
    conj = motion_axis_alignment(
        transforms_global(rest_anim)[0], bone_names,
        np.stack([np.array(b.matrix_local) for b in bones]), [b.name for b in bones],
        conj_rot=tpos_rot)
    if conj is not None:
        tpos_global_rot = rotations_to_quats(conj)

    keyframes = compute_bone_keyframes(
        rest_local_mat, anim_local_mat, bone_names, tpos_global_rot)
    rebuild_action_from_data(char_armature, keyframes)
    update_scene()

    export_animated_character(output_path_no_ext, formats=formats)


# ---------------------------------------------------------------------------
# Batch driver (shared by animate_fbx / animate_mixamo)
# ---------------------------------------------------------------------------

def run_clip_batch(clips, process_one, output_dir, desc):
    """Process clips one by one; failures are logged, not fatal.

    Each failed clip is recorded (with its error) in
    ``<output_dir>/animate_errors.log`` and the batch continues.
    """
    os.makedirs(output_dir, exist_ok=True)
    err_log = os.path.join(output_dir, ERROR_LOG_NAME)
    for clip in tqdm(clips, desc=desc):
        try:
            process_one(clip)
        except Exception as e:  # noqa: BLE001 — keep the batch going
            logger.error(f"Error processing {os.path.basename(clip)}: {e}")
            with open(err_log, "a") as f:
                f.write(f"{os.path.basename(clip)}: {e}\n")
