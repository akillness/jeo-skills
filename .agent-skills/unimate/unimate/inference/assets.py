"""Skeletons to sample on, named by reference.

An *asset* is what sampling and mesh driving need about one skeleton: its
stage-4 cond entry (topology, T-pose, joint names), the dataset whose
normalization stats apply to it, its canonical rest-pose GLB when there is
one, and where its feature clips live. A dataset object type and a custom rig
processed by ``data_process.rig_preprocess`` are the same kind of asset; only
where the files sit differs.

A reference is one of:

- a directory holding ``cond.npy`` with one entry: a ``rig_preprocess``
  output (``summary.json`` beside it names the stats dataset; ``<name>.glb``
  is its canonical GLB; ``motions/`` its clips, written by ``--save_clips``);
- a ``.npy`` cond file with exactly one entry;
- ``<dataset>:<object_type>``: an object type of a dataset (the run's feature
  directory for it, else ``dataset/features/<dataset>``);
- a bare ``<object_type>``: the assets given explicitly (``--asset``) first,
  then the entries of the ``--cond_path`` files, then the run's datasets in
  ``dataset_list`` order.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

import numpy as np

from data_process.utils.asset_files import (
    DEFAULT_MIXAMO_CHARACTER, cond_frame_digest, default_assets_dir)
from unimate.utils.logger import get_logger

logger = get_logger(file_name=__file__)

# Datasets a feature directory or a stats entry can be named after.
DATASET_TYPES = ('truebones', 'mixamo', 'objaverse', 'general')
# Normalization of an asset whose dataset nothing tells.
DEFAULT_STATS_DATASET = 'objaverse'
# The Mixamo object type drives DEFAULT_MIXAMO_CHARACTER's canonical GLB by default.
MIXAMO_OBJECT_TYPE = 'mixamo'


@dataclass
class Asset:
    """One skeleton: see the module docstring."""
    name: str
    cond: dict = field(repr=False)
    stats_dataset: str
    cond_path: str
    source: str
    dataset: Optional[str] = None
    canonical_glb: Optional[str] = None
    motion_dir: Optional[str] = None
    joint_cache_dir: Optional[str] = None

    @property
    def joint_names(self) -> List[str]:
        return [str(n) for n in self.cond['joint_names']]

    def clip_files(self, clip_ids: Optional[Iterable[str]] = None) -> List[str]:
        """Feature-clip file names of this asset in ``motion_dir`` (all, or
        those whose stem matches one of *clip_ids*: the clip id, or
        ``<name>-<id>`` / ``<name>_<id>``)."""
        if not self.motion_dir or not os.path.isdir(self.motion_dir):
            return []
        single = self.dataset == MIXAMO_OBJECT_TYPE
        names = sorted(f for f in os.listdir(self.motion_dir) if f.endswith('.npz')
                       and (single or f.startswith(f'{self.name}-')))
        if clip_ids is None:
            return names
        wanted = set()
        for cid in clip_ids:
            if single and cid.startswith(self.clip_key_prefix):
                cid = cid[len(self.clip_key_prefix):]     # the loader's key spelling
            wanted |= {cid, f'{self.name}-{cid}', f'{self.name}_{cid}'}
        return [f for f in names if os.path.splitext(f)[0] in wanted]

    @property
    def clip_key_prefix(self) -> str:
        """Mixamo clips carry no object-type prefix on disk; the loader keys
        them ``mixamo_<file>``."""
        return f'{MIXAMO_OBJECT_TYPE}_' if self.dataset == MIXAMO_OBJECT_TYPE else ''

    def manifest_entry(self) -> dict:
        return {
            'source': self.source,
            'dataset': self.dataset,
            'cond_path': _display_path(self.cond_path),
            'cond_key': self.name,
            'canonical_glb': _display_path(self.canonical_glb) if self.canonical_glb else None,
            'stats_dataset': self.stats_dataset,
            'joint_names': self.joint_names,
            'frame_digest': cond_frame_digest(self.cond),
        }


def _display_path(path: str) -> str:
    """*path* relative to the working directory when it lies under it (runs
    start from the repo root), else absolute."""
    absolute = os.path.abspath(path)
    rel = os.path.relpath(absolute)
    return absolute if rel.startswith('..') else rel


def _load_cond_file(path: str) -> Dict[str, dict]:
    conds = np.load(path, allow_pickle=True).item()
    if not isinstance(conds, dict):
        raise ValueError(f"{path} is not a {{object_type: cond}} dict.")
    return conds


def _summary(folder: str) -> Optional[dict]:
    """A ``rig_preprocess`` output's ``summary.json`` in *folder*, or None."""
    path = os.path.join(folder, 'summary.json')
    if not os.path.isfile(path):
        return None
    with open(path) as f:
        return json.load(f)


def feature_dir_dataset(path: str) -> Optional[str]:
    """The dataset a cond file's directory is the feature directory of
    (``.../<dataset>/cond.npy`` with no ``rig_preprocess`` summary beside it),
    or None."""
    folder = os.path.dirname(os.path.abspath(path))
    name = os.path.basename(os.path.realpath(folder))
    if name in DATASET_TYPES and _summary(folder) is None:
        return name
    return None


def cond_file_dataset_type(path: str) -> str:
    """Dataset whose stats normalize the entries of a cond file: the
    ``stats_dataset`` / ``reference`` / ``profile`` of a ``rig_preprocess``
    ``summary.json`` beside it, else its feature directory's name, else
    ``DEFAULT_STATS_DATASET``."""
    info = _summary(os.path.dirname(os.path.abspath(path)))
    if info is not None:
        for key in ('stats_dataset', 'reference', 'profile'):
            if info.get(key) in DATASET_TYPES:
                return info[key]
        return DEFAULT_STATS_DATASET
    return feature_dir_dataset(path) or DEFAULT_STATS_DATASET


class AssetResolver:
    """Resolve references (module docstring) against a run's datasets.

    *dataset_config* is the run's ``config.dataset``; *assets* are references
    given explicitly (resolved now, addressable by name afterwards);
    *cond_paths* are cond files whose entries are addressable by name;
    *cond_dataset_type* overrides the stats dataset of every asset that is not
    a dataset object type.
    """

    def __init__(self, dataset_config, assets: Iterable[str] = (),
                 cond_paths: Iterable[str] = (), cond_dataset_type: Optional[str] = None):
        self._dataset_dirs = {cfg.type: cfg.path
                              for cfg in (dataset_config.data_configs or {}).values()}
        self._cond_dataset_type = cond_dataset_type
        self._conds: Dict[str, Dict[str, dict]] = {}
        self._cond_paths = list(cond_paths)
        for path in self._cond_paths:
            if not os.path.isfile(path):
                raise FileNotFoundError(f"--cond_path {path} not found.")
        self.explicit: Dict[str, Asset] = {}
        for ref in assets:
            asset = self.resolve(ref)
            other = self.explicit.get(asset.name)
            if other is not None and other.source != asset.source:
                raise ValueError(
                    f"Two assets are named {asset.name!r} ({other.source}, {asset.source}); "
                    f"sample them in separate runs (or rename a custom one with "
                    f"rig_preprocess --name).")
            self.explicit[asset.name] = asset

    # -- files ---------------------------------------------------------------

    def _cond(self, path: str) -> Dict[str, dict]:
        key = os.path.abspath(path)
        if key not in self._conds:
            self._conds[key] = _load_cond_file(path)
        return self._conds[key]

    def features_dir(self, dataset: str) -> str:
        return self._dataset_dirs.get(dataset) or os.path.join('dataset', 'features', dataset)

    # -- references ----------------------------------------------------------

    def resolve(self, ref: str) -> Asset:
        """The asset *ref* names; ``KeyError`` when nothing does, ``ValueError``
        when the reference is malformed."""
        ref = str(ref).strip()
        if not ref:
            raise ValueError("Empty asset reference.")
        if os.path.isdir(ref):
            return self._bundle(ref)
        if ref.endswith('.npy') and os.path.isfile(ref):
            return self._single_cond_file(ref)
        dataset, sep, name = ref.partition(':')
        if sep and dataset in DATASET_TYPES and not os.path.exists(ref):
            return self.dataset_asset(dataset, name)
        if os.sep in ref or ref.endswith('.npy'):
            raise KeyError(f"Asset {ref!r}: no such directory or cond file.")
        return self._by_name(ref)

    def dataset_asset(self, dataset: str, name: str, cond: Optional[dict] = None,
                      root: Optional[str] = None) -> Asset:
        """Object type *name* of *dataset*'s feature directory (*root*, default
        :meth:`features_dir`; *cond*: its entry when already loaded)."""
        root = root or self.features_dir(dataset)
        cond_path = os.path.join(root, 'cond.npy')
        if cond is None:
            if not os.path.isfile(cond_path):
                raise KeyError(f"Asset '{dataset}:{name}': no {cond_path}.")
            conds = self._cond(cond_path)
            if name not in conds:
                raise KeyError(f"Asset '{dataset}:{name}': not an object type of {cond_path}.")
            cond = conds[name]
        glb_name = DEFAULT_MIXAMO_CHARACTER if dataset == MIXAMO_OBJECT_TYPE else name
        glb = os.path.join(default_assets_dir(root), f'{glb_name}.glb')
        return Asset(name=name, cond=cond, stats_dataset=dataset, cond_path=cond_path,
                     source=f'{dataset}:{name}', dataset=dataset,
                     canonical_glb=glb if os.path.isfile(glb) else None,
                     motion_dir=os.path.join(root, 'motions'), joint_cache_dir=root)

    def _bundle(self, path: str) -> Asset:
        cond_path = os.path.join(path, 'cond.npy')
        if not os.path.isfile(cond_path):
            raise KeyError(f"Asset {path!r}: a directory without cond.npy (expected a "
                           f"data_process.rig_preprocess output).")
        asset = self._single_cond_file(cond_path)
        asset.source = _display_path(path)
        motions = os.path.join(path, 'motions')
        asset.motion_dir = motions if os.path.isdir(motions) else None
        return asset

    def _single_cond_file(self, path: str) -> Asset:
        conds = self._cond(path)
        if len(conds) != 1:
            raise ValueError(
                f"{path} holds {len(conds)} entries; pass it with --cond_path and name the "
                f"object type in the test cases, or reference '<dataset>:<object_type>'.")
        (name, cond), = conds.items()
        dataset = feature_dir_dataset(path)
        if dataset:
            return self.dataset_asset(dataset, name, cond, root=os.path.dirname(path) or '.')
        glb = os.path.join(os.path.dirname(os.path.abspath(path)), f'{name}.glb')
        return Asset(name=name, cond=cond,
                     stats_dataset=self._cond_dataset_type or cond_file_dataset_type(path),
                     cond_path=path, source=_display_path(path),
                     canonical_glb=glb if os.path.isfile(glb) else None)

    def _by_name(self, name: str) -> Asset:
        if name in self.explicit:
            shadowed = self._dataset_with(name)
            if shadowed and shadowed != self.explicit[name].dataset:
                logger.warning(
                    f"{name!r} is both the given asset {self.explicit[name].source} and an "
                    f"object type of {shadowed}; using the given asset "
                    f"('{shadowed}:{name}' names the dataset's).")
            return self.explicit[name]
        for path in self._cond_paths:
            conds = self._cond(path)
            if name in conds:
                ds = feature_dir_dataset(path)
                if ds:
                    return self.dataset_asset(ds, name, conds[name],
                                              root=os.path.dirname(path) or '.')
                glb = os.path.join(os.path.dirname(os.path.abspath(path)), f'{name}.glb')
                return Asset(name=name, cond=conds[name],
                             stats_dataset=self._cond_dataset_type or cond_file_dataset_type(path),
                             cond_path=path, source=_display_path(path),
                             canonical_glb=glb if os.path.isfile(glb) else None)
        dataset = self._dataset_with(name)
        if dataset:
            return self.dataset_asset(dataset, name)
        raise KeyError(
            f"Asset {name!r} is none of the given assets, not in the --cond_path files and "
            f"not an object type of the run's datasets ({', '.join(self._dataset_dirs) or 'none'}).")

    def _dataset_with(self, name: str) -> Optional[str]:
        """The first of the run's datasets whose cond.npy has object type *name*."""
        for dataset, root in self._dataset_dirs.items():
            cond_path = os.path.join(root, 'cond.npy')
            if os.path.isfile(cond_path) and name in self._cond(cond_path):
                return dataset
        return None
