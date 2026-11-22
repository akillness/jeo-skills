"""Inference entry point: generate motion samples from a trained model.

The skeletons are named by reference (``unimate.inference.assets``): a
``data_process.rig_preprocess`` output, a cond file, or a dataset object type.
With test cases (``--test_cases_json``, ``--test_cases_txt``, or ``--asset``
with ``--prompt``) only those assets are read, so a run needs no dataset on
disk beyond them; without any, the dataset's own split is enumerated.
Next to the motions it writes ``manifest.json`` (see :class:`SampleManifest`).
"""
import dataclasses
import gc
import glob
import json
import os
import re
import time
import warnings
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import tyro
from accelerate.utils import set_seed

warnings.filterwarnings("ignore")

from unimate.configs.schema import MainConfig
from unimate.dataset.conditioning import create_sample_condition
from unimate.dataset.factory import create_dataset, create_skeleton_dataset
from unimate.inference.motion_inbetweening import build_keep_mask, parse_keep_frames
from unimate.inference.motion_editing import (
    build_joint_keep_mask,
    get_joint_names,
    parse_keep_joints,
)
from unimate.inference.assets import Asset, AssetResolver
from unimate.inference.motion_expansion import expand_motion_chain
from unimate.models.flow.transport import Sampler
from unimate.models.factory import create_diffusion, create_model, create_transport
from unimate.training.ema import EMAModel
from unimate.models.text_encoder.factory import create_text_encoder
from unimate.utils.logger import get_logger
from unimate.inference.generate import generate_samples
from unimate.utils.text_emb_cache import pool, sequences_from_hidden
from unimate.utils.visualization import visualize_and_save_motions

logger = get_logger(file_name=__file__)

# (case_id_for_filename, object_type, caption_text, caption_enc, clip_name).
# ``caption_enc`` is the encoded prompt as ``{'caption_emb': (D,),
# 'caption_tokens': (T, D)}`` — the pooled vector text_cond='adaln' reads and
# the token sequence text_cond='cross_attn' attends, mirroring what the data
# loader hands the model at training time. ``clip_name`` is None unless an
# in-betweening / motion-editing run pins a specific clip, whose GT motion is
# then clamped during sampling.
CaptionEnc = Dict[str, np.ndarray]
TestCase = Tuple[str, str, str, CaptionEnc, Optional[str]]


@dataclasses.dataclass
class InferenceArgs:
    """Command-line arguments for inference (parsed by tyro)."""
    exp_dir: str
    model_path: Optional[str] = None
    seed: Optional[int] = None
    output_dir: Optional[str] = None
    num_repetitions: int = 1
    cfg_scale: Optional[float] = None
    # Test cases at cfg_scale > 1.0: a JSON map {"<asset>-<case_id>": prompt}
    # (<asset> a name or '<dataset>:<object_type>'; prompt lists for
    # --motion_expand; <case_id> is the pinned clip id for --inbetween /
    # --motion_edit), or a JSON list of {"asset": ref, "prompt": ...,
    # "id": case_id, "clip": clip_id} (ref also a rig_preprocess output
    # directory or a cond file). When neither this nor --prompt is given,
    # every clip of the dataset's eval split is enumerated as a test case.
    test_cases_json: Optional[str] = None
    # Assets for unconditional sampling at cfg_scale == 1.0, one reference
    # per line. '#' starts a comment.
    test_cases_txt: Optional[str] = None
    # Assets by reference (unimate.inference.assets): a rig_preprocess output
    # directory, a one-entry cond.npy, '<dataset>:<object_type>' or a name.
    # With --prompt (or alone at cfg_scale 1.0) they are the test cases;
    # with --test_cases_json the test cases can name them.
    asset: Tuple[str, ...] = ()
    # Prompts sampled on every --asset, one test case each (for
    # --motion_expand: the segments of one chain per asset).
    prompt: Tuple[str, ...] = ()
    # Per-chunk inference batch size — caps GPU memory regardless of total count.
    batch_size: int = 64
    # Skip mp4/PNG renders; write only the .npy motion features.
    only_save_motion: bool = False
    # Skip the RIC-recovered mp4 (FK render + T-pose still saved).
    # Defaults to False at inference: RIC is largely redundant with FK.
    save_ric: bool = False
    # Motion in-betweening: clamp the specified frames to ground truth and
    # let the flow ODE denoise only the rest. Requires either
    # --test_cases_json (with keys '<object_type>-<clip_id>' resolvable in
    # train or eval motion_dict) or the dataset's eval split.
    inbetween: bool = False
    # Comma-separated signed temporal indices to hold clean. Negatives count
    # from the end of the generation window (max_motion_length), so -1 is the
    # last slot even when the GT clip is shorter (see build_keep_mask).
    # Default keeps first + last slot.
    keep_frames: str = "0,-1"
    # Text-guided motion editing: clamp the listed joints to GT for all
    # frames and let the model denoise the rest under a new caption (e.g.,
    # fix the lower body, change the upper body action). Same clip-pinning
    # requirement as --inbetween; mutually exclusive with it.
    motion_edit: bool = False
    # Comma-separated joint names to hold clean (matched case-insensitive
    # against the per-skeleton ``clean_joint_names`` / ``joint_names``).
    keep_joints: str = ""
    # When set, the GT clip is cropped starting at this absolute frame index
    # (instead of the default 'tpos' random window). Up to max_motion_length
    # frames are taken from start_idx; if fewer remain, the GT is trimmed
    # and the model still generates over the full ODE window but saved
    # outputs (and the GT-clamp signal) are trimmed back via valid_lengths.
    # Most useful with --motion_edit / --inbetween for deterministic, user-
    # chosen edit windows.
    gt_start_frame: Optional[int] = None
    # Motion expansion: chain multiple text-conditioned generations into one
    # long motion. Requires --test_cases_json whose values are *lists* of
    # prompts (one segment per prompt), or --asset with --prompt (the
    # segments, one chain per asset). Each segment after the first pins
    # its first `expand_overlap` frames to the previous segment's last
    # `expand_overlap` frames via replacement-style sampling. Mutually
    # exclusive with --inbetween / --motion_edit.
    motion_expand: bool = False
    # Number of frames overlapped (clamped) between consecutive expansion
    # segments. Must satisfy 0 < expand_overlap < max_motion_length.
    expand_overlap: int = 10
    # cond.npy files of {object_type: cond} (a feature directory's, or a
    # rig_preprocess output's) whose entries the test cases can name: after
    # the --asset assets and before the run's datasets.
    cond_path: Tuple[str, ...] = ()
    # Dataset whose normalization stats apply to every asset that is not a
    # dataset object type. Default: the cond file's feature directory, else
    # the rig_preprocess summary.json's stats_dataset / reference / profile,
    # else objaverse. Irrelevant for a run with one global stats pool.
    cond_dataset_type: Optional[str] = None


class _UnconditionalWrapper(nn.Module):
    """Force ``force_mask=True`` so the caption embedding is always zeroed.

    Used at cfg_scale == 1.0 to mirror training-time CFG dropout while
    preserving topology conditioning.
    """

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, x, timesteps, cond=None):
        return self.model(x, timesteps, cond, force_mask=True)


# ---------------------------------------------------------------------------
# Setup helpers
# ---------------------------------------------------------------------------


def _resolve_exp_paths(exp_dir: str, model_path: Optional[str]) -> Tuple[str, str]:
    """Locate config + highest-step checkpoint inside ``exp_dir``."""
    config_path = os.path.join(exp_dir, "config.json")
    if not os.path.isfile(config_path):
        raise FileNotFoundError(f"No config.json in {exp_dir!r}")

    if model_path is not None:
        return config_path, model_path

    ckpt_dir = os.path.join(exp_dir, "checkpoints")
    candidates = glob.glob(os.path.join(ckpt_dir, "checkpoint_step_*.pt"))
    if not candidates:
        raise FileNotFoundError(f"No checkpoint_step_*.pt files in {ckpt_dir!r}")

    step_re = re.compile(r"checkpoint_step_(\d+)\.pt$")

    def _step(p):
        m = step_re.search(os.path.basename(p))
        return int(m.group(1)) if m else -1

    return config_path, max(candidates, key=_step)


def _build_diffusion(config: MainConfig):
    """Return ``(diffusion, gen_diffusion)`` based on ``training.diff_model``."""
    if config.training.diff_model == 'flow':
        diffusion = create_transport(training_config=config.training)
        return diffusion, Sampler(diffusion)
    if config.training.diff_model == 'diffusion':
        diffusion = create_diffusion(
            scheduler_config=config.scheduler,
            training_config=config.training,
        )
        return diffusion, None
    raise ValueError(f"Unknown diff_model: {config.training.diff_model!r}")


def _load_checkpoint(model, model_path: str, config: MainConfig):
    """Load weights into ``model`` in place; apply EMA shadow if available."""
    state_dict = torch.load(model_path, map_location='cpu')
    model.load_state_dict(state_dict.get('model_state_dict', state_dict))

    if config.training.use_ema and 'ema_state_dict' in state_dict:
        logger.info("Loading EMA weights into model parameters.")
        ema_model = EMAModel(
            parameters=model.parameters(),
            decay=config.training.ema_decay,
            use_ema_warmup=True,
        )
        ema_model.load_state_dict(state_dict['ema_state_dict'])
        ema_model.copy_to(model.parameters())
    else:
        logger.info("Using standard model weights (no EMA).")


def _make_text_encoder(config: MainConfig, device: torch.device):
    # pool=False so a prompt yields its token sequence; ``_encode_prompt``
    # derives the pooled vector from it, the same rule the data loader uses.
    return create_text_encoder(
        encoder_type=config.model.text_encoder_type,
        encoder_version=config.model.text_encoder_version,
        device=str(device),
        pool=False,
    )


def _encode_prompt(encoder, text: str) -> CaptionEnc:
    """Encode one prompt -> ``{'caption_emb': (D,), 'caption_tokens': (T, D)}``.

    Padding is dropped by the attention mask, so the mean over the kept rows
    is exactly the encoder's own pooled output — including for the empty
    prompt, whose mask is all zeros and which therefore pools to the zero
    vector the unconditional reference has always been.
    """
    with torch.no_grad():
        inputs = encoder.tokenize(text)
        hidden = encoder(inputs)                                   # (1, T, D)
    tokens = sequences_from_hidden(hidden.detach().cpu(),
                                   inputs['attention_mask'].cpu())[0]
    return {'caption_emb': pool(tokens), 'caption_tokens': tokens}


def _release_gpu():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _resolve_clip_name(dataset, obj_type: str, clip_id: str) -> Optional[str]:
    """Find the dataset key whose stem matches ``clip_id`` for ``obj_type``.

    Motion-dict keys are filenames (typically with a ``.npz`` extension);
    user-supplied case ids omit the extension. We search train then eval —
    same priority as :func:`create_sample_condition` — and verify the
    ``object_type`` so a clip-id collision across types can't pin the wrong
    skeleton.
    """
    md = dataset.motion_dataset
    # Accept either the suffix-only form (``clip_id``) or one of the prefixed
    # forms that match motion_dict keys: Truebones/Objaverse stems are
    # "{obj_type}-{clip_id}", Mixamo prefixed stems are "{obj_type}_{clip_id}".
    candidates = {clip_id, f"{obj_type}-{clip_id}", f"{obj_type}_{clip_id}"}
    for source in (md.train_motion_dict, md.eval_motion_dict):
        for clip_name in source:
            stem = os.path.splitext(clip_name)[0]
            if stem in candidates and source[clip_name].get('object_type') == obj_type:
                return clip_name
    return None


def _load_test_cases_from_dataset(dataset) -> List[TestCase]:
    """Enumerate test cases from the dataset, prioritised by data-loader source.

    Three regimes, in priority order:

    1. **eval split populated by ``test_objects.txt``** (data loader saw an
       explicit object-type holdout list): per-clip enumeration, no dedup.
       Every clip in the listed object_types becomes its own test case.
       This is the default for quantitative evaluation.

    2. **eval split populated by ``test_split_ratio > 0``** (no
       ``test_objects.txt``, but a random clip-level split exists):
       per-clip enumeration, no dedup. Same as (1) but the eval-set
       composition came from the random-split logic in the dataloader.

    3. **no eval split** (``test_objects.txt`` absent and ratio == 0):
       dedup'd unique ``(object_type, caption)`` enumeration on the train
       split — a visualization sweep with no held-out set.

    Captions reuse pre-encoded embeddings — no text encoder needed.
    """
    md = dataset.motion_dataset

    if md.eval_motion_dict:
        source, split, dedup = md.eval_motion_dict, 'eval', False
        if any(v for v in md.explicit_eval_objects.values()):
            origin = "test_objects.txt (explicit object_type holdout)"
        else:
            origin = "test_split_ratio (random clip holdout)"
    else:
        source, split, dedup = md.train_motion_dict, 'train', True
        origin = "fallback — no eval split (test_objects.txt absent, ratio=0)"

    seen = set()
    encoded: List[TestCase] = []
    per_object_count: Dict[str, int] = {}
    for clip_name in sorted(source.keys()):
        entry = source[clip_name]
        if 'caption_emb' not in entry:
            continue
        ot = entry['object_type']
        caption = entry['caption']
        if dedup:
            key = (ot, caption)
            if key in seen:
                continue
            seen.add(key)
        per_object_count[ot] = per_object_count.get(ot, 0) + 1
        case_id = os.path.splitext(clip_name)[0]
        # Dataset entries carry both views already (the loader built them).
        enc = {'caption_emb': entry['caption_emb']}
        if 'caption_tokens' in entry:
            enc['caption_tokens'] = entry['caption_tokens']
        encoded.append((case_id, ot, caption, enc, clip_name))

    if not encoded:
        raise ValueError(
            "No usable test cases in dataset: no clips have a pre-encoded caption."
        )
    mode = 'unique (object_type, caption)' if dedup else 'per-clip'
    summary = ', '.join(f'{ot}={n}' for ot, n in sorted(per_object_count.items()))
    logger.info(
        f"Auto-enumerated {len(encoded)} {mode} test cases from {split} split "
        f"[source: {origin}] [{summary}]."
    )
    return encoded


# ---------------------------------------------------------------------------
# Test cases: what to sample, on which asset
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class CaseSpec:
    """One test case before its asset is resolved.

    ``ref`` names the asset (``unimate.inference.assets``); ``tag`` is the
    free part of the case id (output files are ``<asset>-<tag>-rep_<r>-<i>.npy``,
    or ``<asset>-rep_...`` without one); ``prompt`` a string, a list of
    strings (``--motion_expand``) or ``''`` (unconditional); ``clip`` the
    clip id whose ground truth in-betweening / motion editing hold.
    """
    ref: str
    tag: Optional[str]
    prompt: object
    clip: Optional[str] = None
    asset: Optional[Asset] = None

    @property
    def case_id(self) -> str:
        return f'{self.asset.name}-{self.tag}' if self.tag else self.asset.name


def _slug(text: str, max_len: int = 48) -> str:
    """A file-name tag from a prompt: its words, lower-case, joined by '_'."""
    words = re.findall(r'[a-z0-9]+', str(text).lower())
    slug = ''
    for w in words:
        if len(slug) + len(w) + 1 > max_len:
            break
        slug = f'{slug}_{w}' if slug else w
    return slug or 'case'


def _cases_from_json(path: str, needs_gt: bool) -> List[CaseSpec]:
    """Cases of a test-case file: a ``{"<asset>-<tag>": prompt}`` map (the tag
    is also the pinned clip id of in-betweening / motion editing), or a list of
    ``{"asset": ref, "prompt": ..., "id": tag, "clip": clip id}`` entries
    (``id`` and ``clip`` optional; the tag defaults to the clip id, else a slug
    of the prompt)."""
    with open(path) as f:
        raw = json.load(f)
    specs = []
    if isinstance(raw, dict):
        for key, prompt in raw.items():
            ref, _, tag = key.partition('-')
            specs.append(CaseSpec(ref=ref, tag=tag or None, prompt=prompt,
                                  clip=(tag or None) if needs_gt else None))
    elif isinstance(raw, list):
        for i, entry in enumerate(raw):
            if not isinstance(entry, dict) or not entry.get('asset'):
                raise ValueError(f"{path} entry {i}: expected an object with an 'asset' key.")
            prompt = entry.get('prompt', '')
            clip = entry.get('clip') or (entry.get('id') if needs_gt else None)
            first = prompt[0] if isinstance(prompt, list) and prompt else prompt
            tag = entry.get('id') or clip or (_slug(first) if first else None)
            specs.append(CaseSpec(ref=str(entry['asset']), tag=tag, prompt=prompt,
                                  clip=clip))
    else:
        raise ValueError(f"{path}: expected a JSON object or list of test cases.")
    if not specs:
        raise ValueError(f"No test cases in {path}.")
    return specs


def _parse_cases(args: InferenceArgs, cfg_scale: float) -> Optional[List[CaseSpec]]:
    """The test cases the arguments name, or None when the dataset's own split
    is enumerated instead (cfg > 1 without a test-case file or prompts)."""
    if cfg_scale > 1.0:
        if args.test_cases_json is not None:
            return _cases_from_json(args.test_cases_json, args.inbetween or args.motion_edit)
        if args.prompt:
            if args.motion_expand:
                return [CaseSpec(ref=ref, tag=_slug(args.prompt[0]), prompt=list(args.prompt))
                        for ref in args.asset]
            return [CaseSpec(ref=ref, tag=_slug(p), prompt=p)
                    for ref in args.asset for p in args.prompt]
        return None
    if args.test_cases_txt is not None:
        with open(args.test_cases_txt) as f:
            refs = [line.strip() for line in f
                    if line.strip() and not line.lstrip().startswith('#')]
        if not refs:
            raise ValueError(f"No object types in {args.test_cases_txt}.")
    else:
        refs = list(args.asset)
    return [CaseSpec(ref=ref, tag=None, prompt='') for ref in refs]


def _resolve_cases(specs: List[CaseSpec], resolver: AssetResolver
                   ) -> Tuple[List[CaseSpec], Dict[str, Asset]]:
    """Resolve every case's asset. A case whose asset cannot be found is
    skipped with a warning; two different assets sharing a name are an error
    (object types and output files are keyed by it)."""
    assets: Dict[str, Asset] = {}
    resolved: Dict[str, Asset] = {}
    kept, seen = [], set()
    for spec in specs:
        if spec.ref not in resolved:
            try:
                resolved[spec.ref] = resolver.resolve(spec.ref)
            except (KeyError, ValueError) as exc:
                logger.warning(f"Test case asset {spec.ref!r} skipped: {exc}")
                resolved[spec.ref] = None
        asset = resolved[spec.ref]
        if asset is None:
            continue
        other = assets.get(asset.name)
        if other is not None and other.source != asset.source:
            raise ValueError(
                f"Two assets named {asset.name!r} in one run ({other.source}, "
                f"{asset.source}); sample them in separate runs (or rename a custom one "
                f"with rig_preprocess --name).")
        assets[asset.name] = asset
        spec.asset = asset
        if spec.case_id in seen:
            base, n = spec.tag or 'case', 2
            while f'{asset.name}-{base}_{n}' in seen:
                n += 1
            logger.warning(f"Test case id {spec.case_id!r} repeats; this one becomes "
                           f"'{asset.name}-{base}_{n}'.")
            spec.tag = f'{base}_{n}'
        seen.add(spec.case_id)
        kept.append(spec)
    if not kept:
        raise ValueError("No test case names a usable asset (see the warnings above).")
    return kept, assets


def _register_assets(dataset, assets: Dict[str, Asset], specs: List[CaseSpec],
                     needs_gt: bool, config: MainConfig,
                     cache_dirs: Tuple[str, ...] = ()) -> Dict[str, Asset]:
    """Add the assets to a :class:`SkeletonDataset` (with the clips the cases
    pin when *needs_gt*). Joint names come from the feature directories'
    caches (*cache_dirs*: the run's, where present) before any is encoded.
    Returns the assets that registered; one the model cannot take (too many
    joints, not a canonical cond) is dropped with a warning."""
    md = dataset.motion_dataset
    md.merge_joint_name_cache(sorted({a.joint_cache_dir for a in assets.values()
                                      if a.joint_cache_dir} | set(cache_dirs)))
    clip_ids: Dict[str, set] = {}
    for spec in specs:
        if spec.clip:
            clip_ids.setdefault(spec.asset.name, set()).add(spec.clip)
    lo = config.dataset.min_joints
    usable = {}
    for name, asset in assets.items():
        n_joints = len(asset.cond['parents'])
        if n_joints < lo:
            logger.warning(f"{name!r} has {n_joints} joints, fewer than the {lo} the run "
                           f"trained on; expect weaker motion.")
        clip_files = asset.clip_files(clip_ids.get(name, ())) if needs_gt else ()
        try:
            md.add_cond_object(name, asset.cond, asset.stats_dataset,
                               motion_dir=asset.motion_dir, clip_files=clip_files,
                               clip_key_prefix=asset.clip_key_prefix)
        except ValueError as exc:
            logger.warning(f"Asset {asset.source} not usable: {exc}")
            continue
        usable[name] = asset
    if not usable:
        raise ValueError("None of the test cases' assets can be sampled (see the warnings above).")
    return usable


def _encode_cases(specs: List[CaseSpec], dataset, encoder, args: InferenceArgs,
                  cfg_scale: float):
    """``TestCase`` tuples (or, for ``--motion_expand``, ``(case_id,
    object_type, prompts, encodings)``) for the cases whose asset registered."""
    md = dataset.motion_dataset
    needs_gt = args.inbetween or args.motion_edit
    cases = []
    null_enc = None
    for spec in specs:
        name = spec.asset.name
        if name not in md.cond_dict:
            continue
        if cfg_scale == 1.0:
            if null_enc is None:
                null_enc = _encode_prompt(encoder, "")
            cases.append((spec.case_id, name, "", null_enc, None))
            continue
        if args.motion_expand:
            prompts = spec.prompt
            if not isinstance(prompts, list):
                logger.warning(f"Test case {spec.case_id!r}: --motion_expand needs a list "
                               f"of prompts, got {type(prompts).__name__}; skipping.")
                continue
            valid = [p.strip() for p in prompts if isinstance(p, str) and p.strip()]
            if len(valid) != len(prompts):
                logger.warning(f"Test case {spec.case_id!r}: {len(prompts) - len(valid)} "
                               f"prompt(s) empty or non-string; keeping {len(valid)}.")
            if not valid:
                continue
            cases.append((spec.case_id, name, valid,
                          [_encode_prompt(encoder, p) for p in valid]))
            continue
        prompt = spec.prompt
        if not isinstance(prompt, str):
            logger.warning(f"Test case {spec.case_id!r}: expected a prompt string, got "
                           f"{type(prompt).__name__} (prompt lists are for "
                           f"--motion_expand); skipping.")
            continue
        if not prompt.strip():
            # At cfg > 1 an empty prompt collapses to unconditional output,
            # almost always a data-entry mistake.
            logger.warning(f"Test case {spec.case_id!r}: empty prompt; skipping.")
            continue
        clip_name = None
        if needs_gt:
            if not spec.clip:
                logger.warning(f"Test case {spec.case_id!r}: in-betweening / motion editing "
                               f"need a clip id; skipping.")
                continue
            clip_name = _resolve_clip_name(dataset, name, spec.clip)
            if clip_name not in md.cond_object_clips.get(name, ()):
                clip_name = None            # the rest-pose reference is no ground truth
            if clip_name is None:
                where = spec.asset.motion_dir or 'none (a rig_preprocess output keeps its ' \
                                                 'clips with --save_clips)'
                logger.warning(f"Test case {spec.case_id!r}: no clip file of {name!r} matches "
                               f"{spec.clip!r} (clip directory: {where}); skipping.")
                continue
        cases.append((spec.case_id, name, prompt, _encode_prompt(encoder, prompt), clip_name))
    if not cases:
        raise ValueError("No usable test cases (see the warnings above).")
    logger.info(f"Prepared {len(cases)} test case(s) on {len({c[1] for c in cases})} asset(s).")
    return cases


class SampleManifest:
    """``<output_dir>/manifest.json``: for every saved motion, the asset it
    was generated for (cond file and key, joint order, canonical GLB, stats
    dataset), its prompt and the run that made it. Mesh driving
    (``scripts/run_animate_motion.sh <output_dir>``) reads it instead of being
    told the dataset, cond and character again.

    Every motion also records the frame digest of its asset's cond
    (``frame_digest``), against which mesh driving checks the cond and the
    canonical GLB. A run into a directory that already holds a manifest adds
    to it: earlier motions stay drivable. An earlier asset of the same name
    that differs (another cond, another joint order, another canonical frame)
    loses its motions from the manifest, since their files may be overwritten
    by this run's. Rewritten after every chunk.
    """

    FILE = 'manifest.json'
    FORMAT = 'unimate-samples/1'
    # What makes two manifest assets of one name the same skeleton; a key an
    # earlier manifest does not record is not compared.
    IDENTITY = ('cond_path', 'cond_key', 'joint_names', 'frame_digest')

    def __init__(self, output_dir: str, args: InferenceArgs, model_path: str,
                 cfg_scale: float, mode: str, assets: Dict[str, Asset]):
        self.path = os.path.join(output_dir, self.FILE)
        self.data = {'format': self.FORMAT, 'motions_dir': 'motions', 'runs': [],
                     'assets': {}, 'samples': {}}
        if os.path.isfile(self.path):
            try:
                with open(self.path) as f:
                    old = json.load(f)
            except (OSError, ValueError):
                old = {}
            if old.get('format') == self.FORMAT:
                self.data.update(runs=old.get('runs', []), assets=old.get('assets', {}),
                                 samples=old.get('samples', {}))
        for name, asset in sorted(assets.items()):
            entry = asset.manifest_entry()
            prev = self.data['assets'].get(name)
            if prev is not None and any(k in prev and prev[k] != entry[k]
                                        for k in self.IDENTITY):
                dropped = [k for k, v in self.data['samples'].items() if v.get('asset') == name]
                for k in dropped:
                    del self.data['samples'][k]
                logger.warning(f"{self.path}: asset {name!r} differs from the one earlier runs "
                               f"sampled ({prev.get('source')}); their {len(dropped)} motion(s) "
                               f"are no longer listed.")
            self.data['assets'][name] = entry
        self.run = len(self.data['runs'])
        self.data['runs'].append({'exp_dir': args.exp_dir, 'checkpoint': model_path,
                                  'cfg_scale': cfg_scale, 'seed': args.seed, 'mode': mode})

    def add(self, npy_name: str, case_id: str, asset: str, prompt: str, kind: str = 'sample'):
        frame = self.data['assets'].get(asset, {}).get('frame_digest')
        self.data['samples'][npy_name] = {'asset': asset, 'case_id': case_id, 'prompt': prompt,
                                          'kind': kind, 'run': self.run, 'frame_digest': frame}

    def save(self):
        tmp = f'{self.path}.tmp'
        with open(tmp, 'w') as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, self.path)


def _resolve_stats_path(exp_dir: str) -> Optional[str]:
    """Return path to ``dataset_stats.npy`` in ``exp_dir``, or ``None``."""
    candidate = os.path.join(exp_dir, "dataset_stats.npy")
    return candidate if os.path.isfile(candidate) else None


# ---------------------------------------------------------------------------
# Sampling
# ---------------------------------------------------------------------------


def _validate_cfg_inputs(cfg_scale: float, args: InferenceArgs):
    if cfg_scale < 1.0:
        raise ValueError(f"cfg_scale must be >= 1.0, got {cfg_scale}.")
    if args.inbetween and args.motion_edit:
        raise ValueError(
            "--inbetween and --motion_edit are mutually exclusive (different "
            "mask axes — frames vs. joints)."
        )
    if args.motion_expand and (args.inbetween or args.motion_edit):
        raise ValueError(
            "--motion_expand is mutually exclusive with --inbetween / --motion_edit."
        )
    if (args.inbetween or args.motion_edit) and cfg_scale <= 1.0:
        # cfg==1.0 samples unconditionally from --test_cases_txt / --asset
        # (no clip pinning), so there's no GT motion to clamp against.
        mode = '--inbetween' if args.inbetween else '--motion_edit'
        raise ValueError(
            f"{mode} requires cfg_scale > 1.0 so test cases come from "
            f"--test_cases_json or the dataset eval split (both pin a clip)."
        )
    if args.prompt and args.test_cases_json is not None:
        raise ValueError("Give --prompt or --test_cases_json, not both.")
    if args.prompt and not args.asset:
        raise ValueError("--prompt is sampled on the --asset assets; give at least one.")
    if args.prompt and (args.inbetween or args.motion_edit):
        raise ValueError("--inbetween / --motion_edit pin clips by id: give them in "
                         "--test_cases_json.")
    if args.motion_expand and cfg_scale <= 1.0:
        raise ValueError(
            "--motion_expand requires cfg_scale > 1.0 and prompt lists (--test_cases_json) "
            "or --asset with --prompt."
        )
    if args.motion_expand and args.test_cases_json is None and not args.prompt:
        raise ValueError(
            "--motion_expand requires --test_cases_json with per-case prompt lists, or "
            "--asset with --prompt (the segments)."
        )
    if args.motion_edit and not args.keep_joints.strip():
        raise ValueError(
            "--motion_edit requires --keep_joints (comma-separated joint names)."
        )
    if cfg_scale > 1.0:
        if (args.cond_path or args.asset) and args.test_cases_json is None and not args.prompt:
            raise ValueError("--asset / --cond_path at cfg_scale > 1.0 need --prompt or "
                             "--test_cases_json naming what to sample.")
        if args.test_cases_json is None and not args.prompt:
            logger.info(
                f"cfg_scale={cfg_scale} > 1.0 with no --test_cases_json: "
                f"enumerating the dataset's test split (per-clip if eval split "
                f"is non-empty, else dedup-fallback on train)."
            )
        if args.test_cases_txt is not None:
            logger.warning(
                "--test_cases_txt is ignored at cfg > 1.0 — the dataset's "
                "test_objects.txt drives the eval split at data-loading time."
            )
    else:  # cfg_scale == 1.0
        if args.test_cases_txt is None and not args.asset:
            raise ValueError("cfg_scale=1.0 requires --test_cases_txt or --asset.")
        if args.test_cases_json is not None:
            logger.warning("--test_cases_json ignored because cfg_scale == 1.0.")
        if args.prompt:
            logger.warning("--prompt ignored because cfg_scale == 1.0 (unconditional).")


def _load_captions_map(path: str) -> Dict[str, str]:
    """An earlier run's ``captions.json`` in the same output directory, so it
    keeps listing that run's motions (as ``manifest.json`` does)."""
    if not os.path.isfile(path):
        return {}
    try:
        with open(path) as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _wrap_for_cfg(model, cfg_scale: float):
    """Pass-through at cfg > 1.0; force unconditional inference at cfg == 1.0."""
    if cfg_scale > 1.0:
        return model
    if not (getattr(model, 'cond_mask_prob', 0) > 0):
        logger.warning(
            "Unconditional sampling requested but model was trained with "
            "cond_mask_prob == 0; sample quality may be poor."
        )
    logger.info("Wrapping model in _UnconditionalWrapper (force_mask=True).")
    return _UnconditionalWrapper(model)


def _gt_valid_lengths(dataset, clip_names, gt_offset: int, max_T: int,
                      device: torch.device) -> torch.Tensor:
    """Per-clip usable GT frame counts, as a ``(B,)`` long tensor.

    Lengths come from the source motion_dict (``cond["motion_length"]``
    reports the padded length at inference, which would resolve ``-1`` to a
    zero-padded frame instead of the clip's true last frame). When the GT was
    cropped from ``gt_offset`` (``--gt_start_frame``), the usable length is
    ``n - gt_offset``; everything is clamped to ``[0, max_T]``.
    """
    md = dataset.motion_dataset
    return torch.tensor(
        [
            max(0, min(
                (md.train_motion_dict.get(cn)
                 or md.eval_motion_dict[cn])['motion'].shape[0] - gt_offset,
                max_T,
            ))
            for cn in clip_names
        ],
        dtype=torch.long, device=device,
    )


def _run_sampling(
    config: MainConfig,
    sample_model,
    dataset,
    cases: List[TestCase],
    diffusion,
    gen_diffusion,
    cfg_scale: float,
    device: torch.device,
    args: InferenceArgs,
    output_dir: str,
    manifest: Optional['SampleManifest'] = None,
):
    """Generate ``num_repetitions`` samples per test case, in chunks of
    ``args.batch_size``. ``no_grad`` keeps the ODE rollout from accumulating
    autograd graphs across denoising steps.

    When ``args.inbetween`` is set, ``create_sample_condition`` returns the
    normalized GT motion (because ``test_case_captions`` now includes the
    pinned clip_name). That GT plus a keep_mask are passed to
    ``generate_samples`` which routes to the replacement-style sampler.
    Each case's GT is also saved as ``<case_id>-gt.npy`` for side-by-side
    rendering. *manifest* records every saved motion.
    """
    test_cases = cases
    # Only pin the reference clip when in-betweening or motion-editing (the
    # clip's GT motion is what the sampler clamps against). Other runs let
    # create_sample_condition pick a random clip of the same object_type,
    # since only the skeleton is needed.
    needs_gt = args.inbetween or args.motion_edit
    if needs_gt and args.gt_start_frame:
        # A pinned clip that ends before the start frame has no GT window.
        md = dataset.motion_dataset
        kept = []
        for case in test_cases:
            clip = case[4]
            n = (md.train_motion_dict.get(clip) or md.eval_motion_dict[clip])['motion'].shape[0]
            if n > args.gt_start_frame:
                kept.append(case)
            else:
                logger.warning(f"Test case {case[0]!r}: clip {clip!r} has {n} frames, "
                               f"none from --gt_start_frame={args.gt_start_frame}; skipping.")
        if not kept:
            raise ValueError(f"No test case has a clip longer than "
                             f"--gt_start_frame={args.gt_start_frame}.")
        test_cases = kept
    if needs_gt:
        test_case_captions = [
            (ot, cap, emb, clip) for _, ot, cap, emb, clip in test_cases
        ]
    else:
        test_case_captions = [
            (ot, cap, emb) for _, ot, cap, emb, _ in test_cases
        ]
    case_ids = [case_id for case_id, *_ in test_cases]
    captions_text = [caption for _, _, caption, _, _ in test_cases]
    total = len(test_cases)
    chunk_size = max(1, args.batch_size)
    use_cuda_sync = device.type == 'cuda'

    keep_frame_indices = parse_keep_frames(args.keep_frames) if args.inbetween else None
    keep_joint_names = parse_keep_joints(args.keep_joints) if args.motion_edit else None
    if args.inbetween:
        logger.info(f"In-betweening: keep_frames={keep_frame_indices}.")
    if args.motion_edit:
        logger.info(f"Motion editing: keep_joints={keep_joint_names}.")

    # ``captions.json`` mirrors the motion-feature filenames written by
    # ``visualize_and_save_motions``: keys are ``<case_id>-rep_<rep>-<idx>.npy``,
    # values are the prompt used to condition each sample. Rewritten after
    # every chunk so a partial run still leaves a valid index on disk.
    captions_path = os.path.join(output_dir, 'captions.json')
    captions_map: Dict[str, str] = _load_captions_map(captions_path)

    logger.info(
        f"Starting sampling: {total} test cases × {args.num_repetitions} reps "
        f"in chunks of {chunk_size}."
    )

    with torch.no_grad():
        for rep_i in range(args.num_repetitions):
            logger.info(f'--- rep #{rep_i} ---')
            for chunk_start in range(0, total, chunk_size):
                chunk_end = min(chunk_start + chunk_size, total)
                # test_case_captions drives selection here, one reference
                # clip per case, so create_sample_condition's own sampling
                # (num_samples) never applies.
                gt_motion, cond = create_sample_condition(
                    config=config,
                    data=dataset,
                    test_case_captions=test_case_captions[chunk_start:chunk_end],
                    # Only a pinned GT clip is cropped; a plain run's random
                    # reference clip just supplies the skeleton.
                    gt_start_frame=args.gt_start_frame if needs_gt else None,
                )
                cond = {
                    k: v.to(device) if torch.is_tensor(v) else v
                    for k, v in cond.items()
                }
                bsz = cond["n_joints"].shape[0]
                motion_shape = (
                    bsz,
                    config.dataset.max_joints,
                    config.dataset.feature_len,
                    config.dataset.max_motion_length,
                )

                # Replacement-style sampling for in-betweening or motion
                # editing. Both branches share the same GT-clamping sampler
                # (only the mask differs); ``generate_samples`` routes on the
                # presence of x1_known + keep_mask.
                x1_known = None
                keep_mask = None
                gt_valid_lengths = None  # per-sample lengths for trimming saved GT
                sample_valid_lengths = None  # same, for the generated sample (motion_edit only)
                if args.inbetween:
                    chunk_clip_names = [
                        c for _, _, _, _, c in test_cases[chunk_start:chunk_end]
                    ]
                    max_T = config.dataset.max_motion_length
                    valid_lengths = _gt_valid_lengths(
                        dataset, chunk_clip_names, args.gt_start_frame or 0,
                        max_T, device,
                    )
                    keep_mask, resolved_keep = build_keep_mask(
                        valid_lengths, keep_frame_indices, max_T, device,
                        labels=chunk_clip_names,
                    )
                    x1_known = gt_motion.to(device)
                    # For clips shorter than the padded ODE window, copy the
                    # clip's actual last frame into any keep slot beyond T_i
                    # so the generation endpoint (e.g. frame 59) clamps to a
                    # real GT pose instead of the zero-padded slot.
                    for i in range(bsz):
                        T_i = int(valid_lengths[i].item())
                        if T_i >= max_T:
                            continue
                        last_gt = x1_known[i, :, :, T_i - 1].clone()
                        for idx in resolved_keep:
                            if idx >= T_i:
                                x1_known[i, :, :, idx] = last_gt
                    gt_valid_lengths = valid_lengths
                elif args.motion_edit:
                    # Per-sample joint names come from the (already-loaded)
                    # cond_dict — same source the model used at training to
                    # build joint_names_emb, so indices align.
                    chunk_object_types = cond["object_type"]
                    joint_names_per_sample = [
                        get_joint_names(dataset, ot) for ot in chunk_object_types
                    ]
                    keep_mask = build_joint_keep_mask(
                        joint_names_per_sample,
                        keep_joint_names,
                        config.dataset.max_joints,
                        device,
                    )
                    x1_known = gt_motion.to(device)
                    # Motion-edit operates on the clip's actual frames only;
                    # the model still generates 60 padded frames, but anything
                    # past T_i is meaningless (no GT to compare against), so
                    # trim both the sample and the GT to the per-clip length
                    # at save time.
                    chunk_clip_names = [
                        c for _, _, _, _, c in test_cases[chunk_start:chunk_end]
                    ]
                    max_T = config.dataset.max_motion_length
                    valid_lengths = _gt_valid_lengths(
                        dataset, chunk_clip_names, args.gt_start_frame or 0,
                        max_T, device,
                    )
                    # The joint-keep mask is (B, J, 1, 1) — broadcasts over
                    # the temporal axis — so kept joints get clamped to GT
                    # at every frame. For samples whose cropped GT is shorter
                    # than max_T (short clips, or ``--gt_start_frame`` near
                    # the clip's end), the zero-padded tail would clamp kept
                    # joints to a zero pose during denoising. Hold the last
                    # real frame instead so the constraint stays
                    # geometrically sensible; the tail is trimmed at save
                    # time via ``valid_lengths``.
                    for i in range(bsz):
                        T_i = int(valid_lengths[i].item())
                        if 0 < T_i < max_T:
                            x1_known[i, :, :, T_i:] = x1_known[i, :, :, T_i - 1:T_i]
                    gt_valid_lengths = valid_lengths
                    sample_valid_lengths = valid_lengths
                    for cn, T_i in zip(chunk_clip_names, valid_lengths.tolist()):
                        logger.info(
                            f"motion_edit: {cn} → valid_length={T_i} "
                            f"(sample + GT will be saved at this length)."
                        )

                if use_cuda_sync:
                    torch.cuda.synchronize(device)
                t_start = time.perf_counter()

                samples = generate_samples(
                    model=sample_model,
                    cond=cond,
                    motion_shape=motion_shape,
                    diff_model=config.training.diff_model,
                    diffusion=diffusion,
                    gen_diffusion=gen_diffusion,
                    device=device,
                    cfg_scale=cfg_scale,
                    x1_known=x1_known,
                    keep_mask=keep_mask,
                )

                if use_cuda_sync:
                    torch.cuda.synchronize(device)
                elapsed = time.perf_counter() - t_start
                logger.info(
                    f'rep#{rep_i} chunk[{chunk_start}:{chunk_end}] '
                    f'{elapsed:.2f}s for batch={bsz} ({elapsed / bsz:.3f}s/motion).'
                )

                # ``rep_{rep_i}`` prefixes every saved file so repetitions of
                # the same test case never collide.
                chunk_case_ids = case_ids[chunk_start:chunk_end]
                visualize_and_save_motions(
                    config=config,
                    cond=cond,
                    samples=samples,
                    save_dir=output_dir,
                    prefix=f'rep_{rep_i}',
                    case_ids=chunk_case_ids,
                    only_save_motion=args.only_save_motion,
                    save_ric=args.save_ric,
                    valid_lengths=sample_valid_lengths,
                )

                # Save GT under a per-rep "gt_rep_<i>" prefix. Per-rep rather
                # than once-only because ``apply_cropping`` picks a random
                # start_idx for ``topology_condition_type='tpos'``, so each
                # rep clamps against a different windowed GT.
                # NOTE the two files can differ in length: motion_edit trims
                # sample and GT alike (``sample_valid_lengths``), while
                # in-betweening trims only the GT — the model is asked for the
                # whole ODE window there, so its output stays max_motion_length
                # even when the reference clip is shorter. Align on frame 0
                # before diffing them.
                # ``gt_valid_lengths`` (set for inbetween and motion_edit)
                # trims the saved GT to the clip's true length rather than
                # the padded ODE window.
                if needs_gt:
                    visualize_and_save_motions(
                        config=config,
                        cond=cond,
                        samples=x1_known,
                        save_dir=output_dir,
                        prefix=f'gt_rep_{rep_i}',
                        case_ids=chunk_case_ids,
                        only_save_motion=args.only_save_motion,
                        save_ric=args.save_ric,
                        valid_lengths=gt_valid_lengths,
                    )

                for object_idx, case_id in enumerate(chunk_case_ids):
                    npy_name = f'{case_id}-rep_{rep_i}-{object_idx}.npy'
                    caption = captions_text[chunk_start + object_idx]
                    captions_map[npy_name] = caption
                    if manifest is not None:
                        obj_type = test_cases[chunk_start + object_idx][1]
                        manifest.add(npy_name, case_id, obj_type, caption)
                        if needs_gt:
                            manifest.add(f'{case_id}-gt_rep_{rep_i}-{object_idx}.npy',
                                         case_id, obj_type, caption, kind='ground_truth')
                with open(captions_path, 'w') as f:
                    json.dump(captions_map, f, indent=2, ensure_ascii=False)
                if manifest is not None:
                    manifest.save()

                # Drop chunk-scoped tensors before the next batch so peak GPU
                # memory tracks per-batch, not per-run, usage.
                del cond, samples
                if x1_known is not None:
                    del x1_known
                _release_gpu()


def _run_expansion_sampling(
    config: MainConfig,
    sample_model,
    dataset,
    cases: List[Tuple[str, str, List[str], List[CaptionEnc]]],
    diffusion,
    gen_diffusion,
    cfg_scale: float,
    device: torch.device,
    args: InferenceArgs,
    output_dir: str,
    manifest: Optional['SampleManifest'] = None,
):
    """Per-case chain generation: each case produces one concatenated motion
    of length ``max_T + (max_T - overlap) * (N - 1)``.

    Each case is processed independently (no cross-case batching) because
    prompt-list lengths can differ. Within a case, the cond dict is set up
    once via ``create_sample_condition`` and the per-segment cond is built
    by swapping in the segment's pre-encoded ``caption_emb`` — ``caption_emb``
    is a fixed-shape ``(B, text_dim)`` tensor (see ``mixture_batch_collate``)
    so the swap is a single tensor assignment. *manifest* records every
    saved motion.
    """
    expand_cases = cases
    overlap = args.expand_overlap
    max_T = config.dataset.max_motion_length
    if overlap <= 0 or overlap >= max_T:
        raise ValueError(
            f"--expand_overlap must be in (0, max_motion_length={max_T}), "
            f"got {overlap}."
        )

    captions_path = os.path.join(output_dir, 'captions.json')
    captions_map: Dict[str, str] = _load_captions_map(captions_path)

    logger.info(
        f"Starting motion-expand sampling: {len(expand_cases)} case(s) × "
        f"{args.num_repetitions} rep(s); overlap={overlap}, max_T={max_T}."
    )

    motion_shape = (
        1,
        config.dataset.max_joints,
        config.dataset.feature_len,
        max_T,
    )

    with torch.no_grad():
        for rep_i in range(args.num_repetitions):
            logger.info(f'--- rep #{rep_i} ---')
            for case_idx, (case_id, obj_type, prompts, embs) in enumerate(expand_cases):
                # Bootstrap the skeleton cond using the first prompt; the
                # caption is overwritten per segment below.
                _, cond = create_sample_condition(
                    config=config,
                    data=dataset,
                    test_case_captions=[(obj_type, prompts[0], embs[0])],
                )
                cond = {
                    k: v.to(device) if torch.is_tensor(v) else v
                    for k, v in cond.items()
                }
                if 'caption_emb' not in cond:
                    raise RuntimeError(
                        "caption_emb missing from cond — --motion_expand requires "
                        "a text-conditioned model (cond_mode='text')."
                    )

                # Per-segment cond dicts share every skeleton field; only the
                # caption and its encodings change. Shallow copy is enough —
                # the tensor reassignment doesn't leak across segments.
                cond_per_segment: List[Dict] = []
                dtype = cond['caption_emb'].dtype
                for prompt, enc in zip(prompts, embs):
                    seg_cond = dict(cond)
                    seg_cond['caption_emb'] = torch.from_numpy(
                        enc['caption_emb']).to(device=device, dtype=dtype).unsqueeze(0)
                    if 'caption_tokens' in enc:
                        toks = torch.from_numpy(enc['caption_tokens']).to(
                            device=device, dtype=dtype).unsqueeze(0)   # (1, T, D)
                        seg_cond['caption_tokens'] = toks
                        seg_cond['caption_mask'] = torch.ones(
                            toks.shape[:2], dtype=torch.bool, device=device)
                    seg_cond['caption'] = [prompt]
                    cond_per_segment.append(seg_cond)

                t_start = time.perf_counter()
                chain = expand_motion_chain(
                    cond_per_segment=cond_per_segment,
                    motion_shape=motion_shape,
                    overlap=overlap,
                    sample_model=sample_model,
                    diff_model=config.training.diff_model,
                    diffusion=diffusion,
                    gen_diffusion=gen_diffusion,
                    cfg_scale=cfg_scale,
                    device=device,
                )
                elapsed = time.perf_counter() - t_start
                logger.info(
                    f'rep#{rep_i} case[{case_idx}] {case_id!r}: '
                    f'{len(prompts)} segments → T_total={chain.shape[-1]} '
                    f'({elapsed:.2f}s).'
                )

                # Stitch the prompts into a single caption for the saved
                # video title; the model never sees this — segment captions
                # were used individually during generation.
                joined_caption = " | ".join(prompts)
                viz_cond = dict(cond)
                viz_cond['caption'] = [joined_caption]

                visualize_and_save_motions(
                    config=config,
                    cond=viz_cond,
                    samples=chain,
                    save_dir=output_dir,
                    prefix=f'rep_{rep_i}',
                    case_ids=[case_id],
                    only_save_motion=args.only_save_motion,
                    save_ric=args.save_ric,
                )

                npy_name = f'{case_id}-rep_{rep_i}-0.npy'
                captions_map[npy_name] = joined_caption
                with open(captions_path, 'w') as f:
                    json.dump(captions_map, f, indent=2, ensure_ascii=False)
                if manifest is not None:
                    manifest.add(npy_name, case_id, obj_type, joined_caption)
                    manifest.save()

                del cond, cond_per_segment, chain
                _release_gpu()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _mode(args: InferenceArgs, cfg_scale: float) -> str:
    if args.inbetween:
        return 'inbetween'
    if args.motion_edit:
        return 'motion_edit'
    if args.motion_expand:
        return 'motion_expand'
    return 'text' if cfg_scale > 1.0 else 'unconditional'


def _prepare_cases(args: InferenceArgs, config: MainConfig, cfg_scale: float,
                   stats_path: Optional[str], device: torch.device):
    """``(dataset, cases, assets)``: the dataset sampling conditions on, the
    encoded test cases (``TestCase`` tuples, or expansion cases) and the
    assets they use (name -> :class:`Asset`)."""
    needs_gt = args.inbetween or args.motion_edit
    specs = _parse_cases(args, cfg_scale)
    if specs is None:
        # No test cases: enumerate the dataset's own split (all its clips).
        if stats_path is None:
            logger.warning(
                f"No dataset_stats.npy in {args.exp_dir}: stats are recomputed from the "
                f"loaded clips, which may not match training-time normalization.")
        dataset = create_dataset(dataset_config=config.dataset, model_config=config.model,
                                 inference=True, stats_path=stats_path)
        cases = _load_test_cases_from_dataset(dataset)
        md = dataset.motion_dataset
        resolver = AssetResolver(config.dataset)
        assets = {}
        for _, name, _, _, clip in cases:
            if name not in assets:
                entry = md.train_motion_dict.get(clip) or md.eval_motion_dict[clip]
                assets[name] = resolver.dataset_asset(entry['dataset_type'], name,
                                                      md.cond_dict[name])
        return dataset, cases, assets

    if stats_path is None:
        raise FileNotFoundError(
            f"No dataset_stats.npy in {args.exp_dir}: sampling needs the run's "
            f"normalization statistics.")
    resolver = AssetResolver(config.dataset, assets=args.asset, cond_paths=args.cond_path,
                             cond_dataset_type=args.cond_dataset_type)
    specs, assets = _resolve_cases(specs, resolver)
    dataset = create_skeleton_dataset(config.dataset, config.model, stats_path)
    encoder = _make_text_encoder(config, device)
    md = dataset.motion_dataset
    md.text_encoder = encoder           # joint names not in a cache use it too
    try:
        run_dirs = tuple(d for d in (resolver.features_dir(cfg.type) for cfg in
                                     config.dataset.data_configs.values()) if os.path.isdir(d))
        assets = _register_assets(dataset, assets, specs, needs_gt, config, run_dirs)
        cases = _encode_cases(specs, dataset, encoder, args, cfg_scale)
    finally:
        md.text_encoder = None
        del encoder
        _release_gpu()
    return dataset, cases, {n: a for n, a in assets.items() if any(c[1] == n for c in cases)}


def main(args: InferenceArgs):
    # Read config first so CLI-omitted fields can fall back to the saved
    # ``sampling`` block (mirrors the cfg_scale fallback below).
    config_path = os.path.join(args.exp_dir, "config.json")
    if not os.path.isfile(config_path):
        raise FileNotFoundError(f"No config.json in {args.exp_dir!r}")
    config = MainConfig.from_json(config_path)

    model_path_arg = args.model_path or config.sampling.model_path
    config_path, model_path = _resolve_exp_paths(args.exp_dir, model_path_arg)
    logger.info(f"Using config:     [{config_path}]")
    logger.info(f"Using checkpoint: [{model_path}]")

    cfg_scale = args.cfg_scale if args.cfg_scale is not None else config.sampling.cfg_scale
    _validate_cfg_inputs(cfg_scale, args)

    base_output = args.output_dir or os.path.join(args.exp_dir, "samples")
    # Inbetween / motion-edit / motion-expand write to a sibling subdir so
    # GT/output pairs don't collide with vanilla sampling artifacts from
    # the same exp_dir.
    if args.inbetween:
        output_dir = os.path.join(base_output, "inbetween")
    elif args.motion_edit:
        output_dir = os.path.join(base_output, "motion_edit")
    elif args.motion_expand:
        output_dir = os.path.join(base_output, "motion_expand")
    else:
        output_dir = base_output
    os.makedirs(output_dir, exist_ok=True)

    if args.inbetween:
        keep_indices = parse_keep_frames(args.keep_frames)
        ledger_path = os.path.join(output_dir, "inbetween_keep.json")
        with open(ledger_path, "w") as f:
            json.dump({"keep_frames": keep_indices}, f, indent=2)
    elif args.motion_edit:
        # Record the user-supplied names; the actual per-skeleton matches
        # (and any misses) are logged by build_joint_keep_mask at run time.
        keep_names = parse_keep_joints(args.keep_joints)
        ledger_path = os.path.join(output_dir, "motion_edit_keep.json")
        with open(ledger_path, "w") as f:
            json.dump({"keep_joints": keep_names}, f, indent=2)
    elif args.motion_expand:
        ledger_path = os.path.join(output_dir, "motion_expand.json")
        with open(ledger_path, "w") as f:
            json.dump({"expand_overlap": args.expand_overlap}, f, indent=2)

    if args.seed is not None:
        set_seed(args.seed)
        logger.info(f"Set random seed to [{args.seed}]")

    device = torch.device(config.sampling.device)
    stats_path = _resolve_stats_path(args.exp_dir)
    # Test cases are encoded before the diffusion model moves to the device,
    # so the text encoder and the model don't coexist on the GPU.
    dataset, cases, assets = _prepare_cases(args, config, cfg_scale, stats_path, device)
    manifest = SampleManifest(output_dir, args, model_path, cfg_scale,
                              _mode(args, cfg_scale), assets)

    logger.info("Creating model and diffusion...")
    model = create_model(
        dataset_config=config.dataset,
        model_config=config.model,
    )
    diffusion, gen_diffusion = _build_diffusion(config)

    logger.info(f"Loading checkpoints from [{model_path}]...")
    _load_checkpoint(model, model_path, config)

    model.to(device)
    model.eval()

    logger.info(f"Using cfg_scale={cfg_scale}")
    sample_model = _wrap_for_cfg(model, cfg_scale)

    run = _run_expansion_sampling if args.motion_expand else _run_sampling
    run(
        config=config,
        sample_model=sample_model,
        dataset=dataset,
        cases=cases,
        diffusion=diffusion,
        gen_diffusion=gen_diffusion,
        cfg_scale=cfg_scale,
        device=device,
        args=args,
        output_dir=output_dir,
        manifest=manifest,
    )
    logger.info(f"Samples and {SampleManifest.FILE} in {output_dir}")


if __name__ == "__main__":
    main(tyro.cli(InferenceArgs))
