"""Dataset / DataLoader factories for the unified Mixture pipeline."""

from typing import Optional, Set

from torch.utils.data import DataLoader

from unimate.dataset.mixture.dataset import Mixture, MixtureSampler, SkeletonDataset
from unimate.dataset.mixture.collate import mixture_batch_collate


def create_dataset(
    dataset_config,
    model_config,
    inference: bool = False,
    target_object_types: Optional[Set[str]] = None,
    target_clip_stems: Optional[Set[str]] = None,
    stats_path: Optional[str] = None,
):
    """Build the Mixture dataset.

    The dataset iterates only over the train split; eval clips are kept in
    memory and exposed via ``eval_object_motions_map`` for sampling /
    visualization / inference.

    Inference args (all ignored when ``inference=False``):
      ``inference`` — use saved ``max_joints`` / ``max_depth`` from the
          config instead of recomputing from the on-disk data.
      ``target_object_types`` — restrict motion + joint-name loads to these
          object types.
      ``target_clip_stems`` — restrict motion loads to these specific clip
          stems (required for in-betweening / motion-editing).
      ``stats_path`` — load normalization stats from disk instead of
          recomputing them.
    """
    if inference:
        if dataset_config.max_joints <= 0 or dataset_config.max_depth <= 0:
            raise ValueError(
                f"inference=True requires saved max_joints/max_depth in the "
                f"config, got max_joints={dataset_config.max_joints}, "
                f"max_depth={dataset_config.max_depth}."
            )
        prebuilt_max_joints = dataset_config.max_joints
        prebuilt_max_depth = dataset_config.max_depth
    else:
        prebuilt_max_joints = 0
        prebuilt_max_depth = 0

    dataset = Mixture(
        data_configs=dataset_config.data_configs,
        topology_condition_type=dataset_config.topology_condition_type,
        max_motion_length=dataset_config.max_motion_length,
        max_joints=dataset_config.max_joints,
        min_joints=dataset_config.min_joints,
        max_depth=dataset_config.max_depth,
        feature_len=dataset_config.feature_len,
        text_encoder_type=model_config.text_encoder_type,
        text_encoder_version=model_config.text_encoder_version,
        use_dataset_stats=dataset_config.use_dataset_stats,
        balanced_stats=dataset_config.balanced_stats,
        tie_std=dataset_config.tie_std,
        use_addition_aug=dataset_config.use_addition_aug,
        use_removal_aug=dataset_config.use_removal_aug,
        use_pooling_aug=dataset_config.use_pooling_aug,
        use_perturbation_aug=dataset_config.use_perturbation_aug,
        test_split_ratio=dataset_config.test_split_ratio,
        split_seed=dataset_config.split_seed,
        max_freqs=model_config.max_freqs,
        ground_motion_height=dataset_config.ground_motion_height,
        realign_feature=dataset_config.realign_feature,
        prebuilt_max_joints=prebuilt_max_joints,
        prebuilt_max_depth=prebuilt_max_depth,
        target_object_types=target_object_types,
        target_clip_stems=target_clip_stems,
        stats_path=stats_path,
        # Sampling always conditions on the normal caption; generic / detail
        # ones are a training-time augmentation, so inference never loads them.
        generic_caption_prob=0.0 if inference else dataset_config.generic_caption_prob,
        detail_caption_prob=0.0 if inference else dataset_config.detail_caption_prob,
    )

    # Propagate auto-computed max_joints and max_depth back to config so model uses them
    dataset_config.max_joints = dataset.max_joints
    dataset_config.max_depth = dataset.max_depth
    # Stats loaded from ``stats_path`` may override the stats settings; keep
    # the saved config.json truthful about the normalization in use.
    md = dataset.motion_dataset
    dataset_config.use_dataset_stats = md.use_dataset_stats
    dataset_config.balanced_stats = md.balanced_stats
    dataset_config.tie_std = md.tie_std

    return dataset


def create_skeleton_dataset(dataset_config, model_config, stats_path: str):
    """A dataset for sampling on skeletons given by their cond entries alone
    (:class:`SkeletonDataset`): the run's padded widths (``config.json``) and
    normalization stats (``dataset_stats.npy``), no feature directory read.
    Add skeletons with ``.motion_dataset.add_cond_object``."""
    if dataset_config.max_joints <= 0 or dataset_config.max_depth <= 0:
        raise ValueError(
            f"Sampling needs the run's saved max_joints/max_depth in its config, got "
            f"max_joints={dataset_config.max_joints}, max_depth={dataset_config.max_depth}.")
    dataset = SkeletonDataset(
        stats_path=stats_path,
        max_motion_length=dataset_config.max_motion_length,
        max_joints=dataset_config.max_joints,
        max_depth=dataset_config.max_depth,
        topology_condition_type=dataset_config.topology_condition_type,
        feature_len=dataset_config.feature_len,
        text_encoder_type=model_config.text_encoder_type,
        text_encoder_version=model_config.text_encoder_version,
        use_dataset_stats=dataset_config.use_dataset_stats,
        balanced_stats=dataset_config.balanced_stats,
        tie_std=dataset_config.tie_std,
        max_freqs=model_config.max_freqs,
        ground_motion_height=dataset_config.ground_motion_height,
        realign_feature=dataset_config.realign_feature,
    )
    md = dataset.motion_dataset
    dataset_config.use_dataset_stats = md.use_dataset_stats
    dataset_config.balanced_stats = md.balanced_stats
    dataset_config.tie_std = md.tie_std
    return dataset


def create_train_dataloader(
    dataset_config,
    model_config,
    balanced: bool = False,
    batch_size: int = 16,
    num_workers: int = 8,
    stats_path: Optional[str] = None,
    seed: int = 0,
):
    """Build the training DataLoader over the train split of the Mixture dataset.

    ``seed`` (``training.seed``) seeds the balanced sampler's draw order.

    ``stats_path`` loads normalization stats from disk instead of computing
    them from the data (resume / fine-tune keep the normalization the
    checkpoint was trained with).
    """
    dataset = create_dataset(dataset_config, model_config, stats_path=stats_path)

    if not balanced and dataset_config.sampler_dataset_weights is not None:
        raise ValueError("dataset.sampler_dataset_weights needs training.balanced=true "
                         "(MixtureSampler); without it clips are drawn uniformly")
    sampler = MixtureSampler(dataset, alpha=dataset_config.sampler_alpha,
                             dataset_alpha=dataset_config.sampler_dataset_alpha,
                             dataset_weights=dataset_config.sampler_dataset_weights,
                             seed=seed,
                             ) if balanced else None

    return DataLoader(
        dataset,
        batch_size=batch_size,
        sampler=sampler,
        shuffle=(sampler is None),
        num_workers=num_workers,
        drop_last=True,
        collate_fn=mixture_batch_collate,
    )
