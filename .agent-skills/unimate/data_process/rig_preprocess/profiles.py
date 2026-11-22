"""Per-dataset processing profiles for one rigged asset.

A profile reproduces what the dataset's own pipeline does to an asset: which
stage-1 exporter (and so which importer, skeleton and frame rules) and which
stage-4 arguments (the ``run_extract_features.sh`` overrides). An unseen asset
takes the profile whose data it resembles; ``auto`` (the default,
:func:`pick_profile`) chooses ``truebones`` for a set of ``{Species}-{Action}.fbx``
clips and ``general``, the catch-all for GLB/GLTF/FBX files, otherwise.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence, Tuple


@dataclass(frozen=True)
class Profile:
    """How one dataset's pipeline processes an asset (see the module docstring)."""
    name: str
    # Stage-1 exporter: 'objaverse' (export_objaverse), 'general'
    # (export_general) or 'truebones' (export_truebones.export_species).
    exporter: str
    # Importer: 'gltf', 'fbx' or 'auto' (by extension).
    importer: str
    # Skin weights from every skinned mesh (general) or the largest one only.
    all_skinned_meshes: bool
    # Leaf-name suffixes that mark an end effector rather than a control bone.
    end_effector_suffixes: Tuple[str, ...]
    # Drop rest-pose frames from clips (export_general --keep_tpose_frames off).
    remove_tpose: bool
    # Extra stage-4 arguments, as run_extract_features.sh passes them.
    stage4_args: Tuple[str, ...] = field(default_factory=tuple)


PROFILES = {
    'objaverse': Profile(
        name='objaverse', exporter='objaverse', importer='gltf',
        all_skinned_meshes=False, end_effector_suffixes=(), remove_tpose=True,
        stage4_args=('--min_joints', '4', '--max_joints', '180')),
    # Rest-pose frames are kept (stage 1 --keep_tpose_frames).
    'general': Profile(
        name='general', exporter='general', importer='auto',
        all_skinned_meshes=True, end_effector_suffixes=('_tip',), remove_tpose=False,
        stage4_args=('--min_joints', '4', '--max_joints', '180')),
    'truebones': Profile(
        name='truebones', exporter='truebones', importer='fbx',
        all_skinned_meshes=False, end_effector_suffixes=(), remove_tpose=False),
}


# Input file extensions each importer accepts.
IMPORTER_EXTS = {'gltf': ('.glb', '.gltf'), 'fbx': ('.fbx',), 'auto': ('.glb', '.gltf', '.fbx')}


AUTO = 'auto'


def pick_profile(inputs: Sequence[str], dataset_export_dir: str = None) -> str:
    """The profile ``auto`` stands for: the dataset of *dataset_export_dir* when
    it has a profile (``--annotate dataset``); ``truebones`` for several FBX
    clips of one species (``{Species}-{Action}.fbx``); else ``general``."""
    if dataset_export_dir:
        name = Path(dataset_export_dir.rstrip('/')).resolve().name
        if name in PROFILES:
            return name
    paths = [Path(p) for p in inputs]
    if (len(paths) > 1 and all(p.suffix.lower() == '.fbx' and '-' in p.stem for p in paths)
            and len({p.stem.split('-', 1)[0] for p in paths}) == 1):
        return 'truebones'
    return 'general'
