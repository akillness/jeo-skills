# MiniMind Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/jingyaogong/minimind](https://github.com/jingyaogong/minimind)
- **Author:** Jingyao Gong
- **Project Goal:** Train a compact 26M–104M parameter language model from scratch in PyTorch within 2–3 hours on consumer GPUs.
- **Upstream Commit:** `233d00fa068ec2b8c0d4f07b703934d6391a5a73`
- **Default Branch:** `master`
- **License:** Apache License 2.0

## Model Variants and Architecture Family
- **MiniMind-Dense:** Pure Decoder-only Transformer with RMSNorm, RoPE, and SwiGLU.
  - `MiniMind-Small`: ~26M parameters (`dim=512`, `n_layers=8`, `n_heads=8`).
  - `MiniMind`: ~104M parameters (`dim=768`, `n_layers=16`, `n_heads=8`).
- **MiniMind-MoE:** Mixture-of-Experts variant with top-k routing and shared expert support.
- **MiniMind-V:** Compact multimodal vision-language model integrating a lightweight vision encoder.
- **MiniMind-Reasoning:** Thinking mode distillation and RL training yielding explicit `<think>...</think>` tokens.

## Operational Boundaries
- **Offline Inspection:** `scripts/preflight.py` is strictly offline, checking PyTorch/transformers/accelerate package availability and inspecting local `LMConfig` json files without network access or process spawning.
- **Training Resources:** Training even a 26M parameter model requires at least 4GB VRAM (NVIDIA CUDA or Apple Silicon MPS). All training scripts (`train_pretrain.py`, `train_full_sft.py`, `train_dpo.py`) must be executed with intentional user authorization.
- **Checkpoints:** Weights are typically stored as PyTorch `.pth` or SafeTensors files, convertible to GGUF format for edge inference in `llama.cpp` or Ollama.
