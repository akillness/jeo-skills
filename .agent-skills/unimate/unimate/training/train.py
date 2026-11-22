"""Train a diffusion model on motions for any skeleton topology.

Entry point (usually via ``accelerate launch``, see scripts/)::

    python -m unimate.training.train --config configs/<config>.json

CLI overrides (via tyro): ``--output_dir``, ``--batch_size``, ``--num_workers``,
``--resume``, ``--stats_path``.
"""

import json
import math
import os
import warnings
from dataclasses import dataclass
from typing import Optional

import torch
import tyro
from accelerate import Accelerator, DataLoaderConfiguration
from accelerate.utils import set_seed
from torch.utils.tensorboard import SummaryWriter
from tqdm import tqdm
from transformers.optimization import get_cosine_with_min_lr_schedule_with_warmup

from unimate.configs.schema import MainConfig
from unimate.dataset.factory import create_train_dataloader
from unimate.models.factory import create_model
from unimate.training.trainer import DiffusionTrainer
from unimate.training.tracker import TrainingTracker
from unimate.utils.logger import get_logger

warnings.filterwarnings("ignore")
logger = get_logger(file_name=__file__)


# ===================================================================
# CLI arguments
# ===================================================================

@dataclass
class TrainingArgs:
    """CLI arguments parsed by tyro (override config values)."""
    config: str
    output_dir: Optional[str] = None
    batch_size: Optional[int] = None
    num_workers: Optional[int] = None
    resume: Optional[str] = None  # path to checkpoint .pt file to resume from
    # Normalization stats to load instead of computing them from the data
    # (e.g. the dataset_stats.npy of the run being fine-tuned). Default: the
    # resumed run's own file with --resume, otherwise computed.
    stats_path: Optional[str] = None


# ===================================================================
# Training loop
# ===================================================================

def train_diffusion(args: TrainingArgs, config: MainConfig,
                    accelerator: Accelerator):
    """End-to-end training: setup, loop, checkpoint, visualize."""

    is_main = accelerator.is_main_process

    # ---- Output directories ----
    output_dir = args.output_dir or config.experiment.output_dir
    checkpoint_dir = os.path.join(output_dir, "checkpoints")
    log_dir = os.path.join(output_dir, "logs")
    debug_dir = os.path.join(output_dir, "debug")
    for d in [checkpoint_dir, log_dir, debug_dir]:
        os.makedirs(d, exist_ok=True)

    # ---- Reproducibility ----
    if config.training.seed is not None:
        # device_specific: seed += process_index. Without it every rank draws
        # the SAME flow-matching t and the same x0 noise (both come from the
        # global RNG), so an 8-GPU step sees one batch's worth of distinct
        # (t, noise) pairs instead of eight — and the same CFG caption-dropout
        # pattern on every rank. Model init may now differ per rank, which is
        # harmless: DDP broadcasts rank 0's parameters when it wraps the model.
        set_seed(config.training.seed, device_specific=True)
        logger.info(
            f"Set random seed to {config.training.seed} (device-specific)")

    # ---- Dataset ----
    logger.info("Creating dataset loader...")
    # `is not None`, not `or`: --num_workers 0 (load in the main process) is
    # a valid override that `or` would silently replace with the config value.
    batch_size = (args.batch_size if args.batch_size is not None
                  else config.training.batch_size)
    num_workers = (args.num_workers if args.num_workers is not None
                   else config.training.num_workers)
    # Write the overrides back so the run's config.json records what ran.
    config.training.batch_size = batch_size
    config.training.num_workers = num_workers
    stats_src = _resolve_train_stats_path(args)
    _pin_resumed_max_depth(args, config)
    dataloader = create_train_dataloader(
        dataset_config=config.dataset,
        model_config=config.model,
        balanced=config.training.balanced,
        batch_size=batch_size,
        num_workers=num_workers,
        stats_path=stats_src,
        seed=config.training.seed or 0,
    )

    # ---- Persist config (after dataset so auto-computed max_joints /
    # max_depth are written; inference reads these back to rebuild the
    # exact same model architecture). ----
    if is_main:
        config_path = os.path.join(output_dir, "config.json")
        config.to_json(config_path)
        logger.info(f"Saved config to {config_path}")

        # Persist normalization stats so inference normalizes identically.
        stats_path = os.path.join(output_dir, "dataset_stats.npy")
        dataloader.dataset.save_dataset_stats(stats_path)

    # ---- Model ----
    logger.info("Creating model and diffusion...")
    model = create_model(
        dataset_config=config.dataset,
        model_config=config.model,
    )

    # ---- Trainer (wraps model + diffusion/flow for loss & visualization) ----
    trainer = DiffusionTrainer(
        config=config,
        model=model,
        data=dataloader,
        checkpoint_dir=checkpoint_dir,
    )

    # ---- Optimizer (the LR schedule follows the tracker, below) ----
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config.training.learning_rate,
        weight_decay=config.training.weight_decay,
        betas=(config.training.adam_beta1, config.training.adam_beta2),
    )

    # ---- Accelerate: wrap model, optimizer, dataloader for distributed ----
    # NOTE: lr_scheduler is NOT wrapped by accelerator. AcceleratedScheduler
    # with split_batches=False steps num_processes times per call to compensate
    # for data sharding, but num_training_steps already equals the target number
    # of optimizer steps, so wrapping would advance the schedule num_gpus× too fast.
    model, optimizer, dataloader = accelerator.prepare(
        model, optimizer, dataloader,
    )
    trainer.model = model  # point trainer at the wrapped model
    trainer.initialize_ema(accelerator)

    # ---- TensorBoard ----
    writer = SummaryWriter(log_dir) if is_main else None

    # ---- Training tracker ----
    # Optimizer steps per epoch: this rank's batches over the accumulation
    # (accelerate also steps on an epoch's last, partial group).
    # An epoch budget wins over num_steps, which the schema always fills in.
    epoch_budget = bool(config.training.num_epochs)
    if epoch_budget and config.training.num_steps and is_main:
        logger.info(f"num_epochs={config.training.num_epochs} sets the budget; "
                    f"num_steps={config.training.num_steps} is ignored.")
    tracker = TrainingTracker(
        max_epochs=config.training.num_epochs if epoch_budget else None,
        max_steps=None if epoch_budget else config.training.num_steps,
        steps_per_epoch=math.ceil(
            len(dataloader) / config.training.gradient_accumulation_steps),
    )
    lr_scheduler = get_cosine_with_min_lr_schedule_with_warmup(
        optimizer,
        num_warmup_steps=int(config.training.warmup_ratio * tracker.total_steps),
        num_training_steps=tracker.total_steps,
        min_lr_rate=config.training.min_lr_ratio,
        num_cycles=0.5,
    )

    # ---- Resume from checkpoint (if requested) ----
    if args.resume:
        _resume_from_checkpoint(
            args.resume, accelerator, model, optimizer, lr_scheduler,
            trainer, tracker,
        )
        # The checkpoint holds no RNG state; reseeding with the resumed step
        # keeps the flow-matching t, noise and caption-dropout draws from
        # repeating the stream the run already used from step 0.
        if config.training.seed is not None:
            set_seed(config.training.seed + tracker.current_step, device_specific=True)

    if is_main:
        logger.info(f"Training for {tracker.get_duration_str()}")

    # ---- Initial visualization (skip if resuming) ----
    if not args.resume:
        trainer.eval()
        if is_main:
            trainer.visualize_samples(
                save_dir=debug_dir,
                prefix="initial_before_training",
                num_samples=config.sampling.num_samples,
                cfg_scale=config.sampling.cfg_scale,
            )
            torch.cuda.empty_cache()

    trainer.train()

    # ---- Main training loop ----
    pbar = tqdm(
        range(tracker.total_steps),
        desc=tracker.get_progress_desc(),
        initial=tracker.current_step,
        disable=not is_main,
    )
    grad_norm = None

    while not tracker.training_finished():
        pbar.set_description(tracker.get_progress_desc())

        # Update sampler epoch so each epoch gets different random indices in DDP
        _set_sampler_epoch(dataloader, tracker.current_epoch)

        for batch in dataloader:
            with accelerator.accumulate(model):
                # Forward pass (mixed precision)
                with accelerator.autocast():
                    loss, loss_dict = trainer.compute_loss(batch)

                # NaN guard. The decision is reduced across ranks first, so
                # every rank takes the same branch — a rank-local skip would
                # desync DDP. A bad micro-batch is dropped by skipping its
                # backward: earlier micro-batches' gradients survive and are
                # all-reduced by the group's final backward as usual. Only
                # when the bad batch IS that final one is there no all-reduce,
                # and then the group's (rank-local) gradients must be thrown
                # away rather than stepped on. Backward on a detached zero
                # would raise 'does not require grad', so never do that.
                bad_local = (~torch.isfinite(loss)).to(torch.int32)
                skip_batch = accelerator.reduce(bad_local, reduction="max").item() == 1
                if skip_batch and is_main:
                    logger.warning(
                        f"[Global skip] non-finite loss at step {tracker.current_step}"
                    )

                # Backward + optimizer step
                if not skip_batch:
                    accelerator.backward(loss)

                if accelerator.sync_gradients and skip_batch:
                    # No all-reduce ran for this accumulation group.
                    optimizer.zero_grad(set_to_none=True)
                elif accelerator.sync_gradients:
                    if config.training.max_grad_norm is not None:
                        grad_norm = accelerator.clip_grad_norm_(
                            accelerator.unwrap_model(model).parameters(),
                            config.training.max_grad_norm,
                        )

                    optimizer.step()
                    lr_scheduler.step()
                    optimizer.zero_grad()

                    # EMA update
                    if trainer.use_ema and trainer.ema_model is not None:
                        trainer.ema_model.step(
                            accelerator.unwrap_model(model).parameters()
                        )

                    pbar.update(1)
                    tracker.step()

                    # --- Per-effective-step side effects ---
                    step = tracker.current_step

                    # Progress bar postfix
                    if is_main:
                        pbar.set_postfix(
                            loss=f"{loss.item():.4f}",
                            lr=f"{lr_scheduler.get_last_lr()[0]:.6f}",
                        )

                    # Periodic logging
                    if step > 0 and step % config.training.log_interval == 0 and is_main:
                        _log_metrics(writer, trainer, lr_scheduler, loss_dict,
                                     grad_norm, config, step)

                    # Periodic checkpoint + visualization
                    if step > 0 and (step % config.training.save_interval == 0
                                     or tracker.training_finished()):
                        # Sync all ranks before checkpoint so rank 1+ don't timeout
                        # waiting during rank 0's lengthy ODE visualization.
                        accelerator.wait_for_everyone()
                        if is_main:
                            _save_checkpoint_and_visualize(
                                trainer, accelerator, model, optimizer, lr_scheduler,
                                tracker, config, checkpoint_dir, debug_dir,
                            )
                        accelerator.wait_for_everyone()

            # Sync all GPUs after the very first step
            if tracker.current_step == 1:
                accelerator.wait_for_everyone()

            if tracker.training_finished():
                break

        if not tracker.training_finished():
            tracker.next_epoch()

    # ---- Cleanup ----
    if is_main:
        writer.close()
        pbar.close()

    accelerator.wait_for_everyone()
    accelerator.end_training()
    logger.info("Training completed.")


# ===================================================================
# Helper functions
# ===================================================================

def _set_sampler_epoch(dataloader, epoch: int):
    """Set the sampler's epoch so each epoch draws different indices (DDP-safe).

    An Accelerate-prepared loader (``DataLoaderShard``) re-sets its sampler
    to its own ``iteration`` counter at the start of every ``__iter__``; that
    counter starts at 0 in a new process, so it must be set through the
    loader's ``set_epoch`` or a resumed run replays the epoch order from 0.

    A plain loader: walk the batch_sampler chain (Accelerate's
    BatchSamplerShard stores the original as ``.batch_sampler``, whose
    ``.sampler`` is the MixtureSampler or DistributedSampler).
    """
    if hasattr(dataloader, 'set_epoch'):
        dataloader.set_epoch(epoch)
        return
    bs = getattr(dataloader, 'batch_sampler', None)
    while bs is not None:
        sampler = getattr(bs, 'sampler', None)
        if sampler is not None and hasattr(sampler, 'set_epoch'):
            sampler.set_epoch(epoch)
            return
        bs = getattr(bs, 'batch_sampler', None)

    # Fallback: direct sampler attribute
    sampler = getattr(dataloader, 'sampler', None)
    if hasattr(sampler, 'set_epoch'):
        sampler.set_epoch(epoch)


def _log_metrics(writer, trainer, lr_scheduler, loss_dict, grad_norm,
                 config, step):
    """Write training scalars to TensorBoard."""
    for key, value in loss_dict.items():
        writer.add_scalar(f"train/{key}", value, step)

    if (trainer.use_ema and trainer.ema_model is not None
            and trainer.ema_model.cur_decay_value is not None):
        writer.add_scalar("train/ema_decay",
                          trainer.ema_model.cur_decay_value, step)

    writer.add_scalar("train/learning_rate",
                      lr_scheduler.get_last_lr()[0], step)

    if config.training.max_grad_norm is not None and grad_norm is not None:
        writer.add_scalar("train/grad_norm", grad_norm, step)


def _save_checkpoint_and_visualize(trainer, accelerator, model, optimizer,
                                   lr_scheduler, tracker, config,
                                   checkpoint_dir, debug_dir):
    """Persist a checkpoint to disk, then render sample visualizations.

    The checkpoint is written first and a visualization failure is only
    logged, so a crash in the debug ODE solve or the renderer can neither
    lose the checkpoint nor end the run.
    """
    checkpoint_dict = {
        "model_state_dict": accelerator.get_state_dict(model),
        "optimizer_state_dict": optimizer.state_dict(),
        "lr_scheduler_state_dict": lr_scheduler.state_dict(),
        "step": tracker.current_step,
        "epoch": tracker.current_epoch,
    }
    if trainer.use_ema and trainer.ema_model is not None:
        checkpoint_dict["ema_state_dict"] = trainer.ema_model.state_dict()

    checkpoint_path = os.path.join(
        checkpoint_dir, f"checkpoint_step_{tracker.current_step}.pt"
    )
    accelerator.save(checkpoint_dict, checkpoint_path)
    logger.info(f"Saved checkpoint to {checkpoint_path}")
    del checkpoint_dict

    try:
        trainer.visualize_samples(
            save_dir=debug_dir,
            prefix=f"step_{tracker.current_step}",
            num_samples=config.sampling.num_samples,
            cfg_scale=config.sampling.cfg_scale,
        )
    except Exception:
        logger.exception(
            f"Sample visualization failed at step {tracker.current_step}; "
            f"the checkpoint is saved and training continues.")
    torch.cuda.empty_cache()


def _resumed_run_dir(resume_path):
    """``<run>`` for ``<run>/checkpoints/<ckpt>.pt`` (the layout training
    writes), else the checkpoint's own directory."""
    ckpt_dir = os.path.dirname(os.path.abspath(resume_path))
    return (os.path.dirname(ckpt_dir)
            if os.path.basename(ckpt_dir) == "checkpoints" else ckpt_dir)


def _pin_resumed_max_depth(args, config):
    """With ``--resume`` and an auto ``dataset.max_depth`` (0), cap it at the
    resumed run's saved value, so the depth embedding keeps the checkpoint's
    shape even if the auto value computed from the data has grown since.
    A config that sets ``max_depth`` wins."""
    if not args.resume or config.dataset.max_depth > 0:
        return
    run_config = os.path.join(_resumed_run_dir(args.resume), "config.json")
    if not os.path.isfile(run_config):
        logger.warning(f"No config.json at {run_config}; max_depth is recomputed "
                       f"from the data and must match the checkpoint's")
        return
    with open(run_config) as f:
        saved = json.load(f).get("dataset", {}).get("max_depth", 0)
    if saved > 0:
        config.dataset.max_depth = saved
        logger.info(f"Resuming: dataset.max_depth capped at the run's saved {saved}")


def _resolve_train_stats_path(args):
    """Stats file the run must reuse, or ``None`` to compute from the data.

    ``--stats_path`` wins. With ``--resume``, the checkpoint's run directory
    supplies the stats the weights were trained with: ``<run>`` for
    ``<run>/checkpoints/<ckpt>.pt`` (the layout training writes), else the
    checkpoint's own directory. Recomputing them would shift the
    normalization whenever the data changed in between.
    """
    if args.stats_path:
        if not os.path.isfile(args.stats_path):
            raise FileNotFoundError(f"--stats_path {args.stats_path} does not exist")
        return args.stats_path
    if args.resume:
        candidate = os.path.join(_resumed_run_dir(args.resume), "dataset_stats.npy")
        if os.path.isfile(candidate):
            return candidate
        logger.warning(
            f"No dataset_stats.npy at {candidate}; recomputing stats from the "
            f"current data, which only matches the checkpoint if the data and "
            f"the stats settings are unchanged. Pass --stats_path to pin them."
        )
    return None


def _resume_from_checkpoint(
    resume_path, accelerator, model, optimizer, lr_scheduler, trainer, tracker,
):
    """Restore all training state from a checkpoint file.

    Loads model weights, optimizer, lr_scheduler, EMA, and fast-forwards the
    tracker to the saved step/epoch so training continues seamlessly.
    """
    logger.info(f"Resuming from checkpoint: {resume_path}")
    checkpoint = torch.load(resume_path, map_location="cpu")

    # Model weights
    unwrapped = accelerator.unwrap_model(model)
    unwrapped.load_state_dict(checkpoint["model_state_dict"])

    # Optimizer
    if "optimizer_state_dict" in checkpoint:
        optimizer.load_state_dict(checkpoint["optimizer_state_dict"])

    # LR scheduler
    if "lr_scheduler_state_dict" in checkpoint:
        lr_scheduler.load_state_dict(checkpoint["lr_scheduler_state_dict"])
    else:
        # Older checkpoint without scheduler state — fast-forward manually
        for _ in range(checkpoint.get("step", 0)):
            lr_scheduler.step()

    # EMA
    if trainer.use_ema and trainer.ema_model is not None:
        if "ema_state_dict" in checkpoint:
            trainer.ema_model.load_state_dict(checkpoint["ema_state_dict"])
            trainer.ema_model.to(accelerator.device)
            logger.info("Restored EMA state from checkpoint.")
        else:
            # No EMA state in checkpoint — rebuild EMA from the just-loaded
            # model weights so it doesn't lag behind with the pre-resume random init.
            trainer.initialize_ema(accelerator)
            logger.warning("No EMA state in checkpoint — EMA re-initialized from loaded model weights.")

    # Tracker
    resumed_step = checkpoint.get("step", 0)
    resumed_epoch = checkpoint.get("epoch", 0)
    tracker.current_step = resumed_step
    tracker.current_epoch = resumed_epoch

    logger.info(f"Resumed at step={resumed_step}, epoch={resumed_epoch}")


# ===================================================================
# Entry point
# ===================================================================

def main(args: TrainingArgs):
    """Parse config and launch training."""
    config = MainConfig.from_json(args.config)

    accelerator = Accelerator(
        dataloader_config=DataLoaderConfiguration(
            use_seedable_sampler=False,
            dispatch_batches=False,
        ),
        gradient_accumulation_steps=config.training.gradient_accumulation_steps,
    )

    if accelerator.is_main_process:
        logger.info("Training Pipeline")
        logger.info(f"  Config: {args.config}")
        logger.info(f"  Mixed Precision: {accelerator.mixed_precision}")
        logger.info(f"  Gradient Accumulation Steps: {accelerator.gradient_accumulation_steps}")

    train_diffusion(args, config, accelerator)


if __name__ == "__main__":
    args = tyro.cli(TrainingArgs)
    main(args)
