---
name: minimind
description: >
  Use when training, fine-tuning, evaluating, or exporting small language models from scratch with MiniMind. Covers compact PyTorch Transformer and MoE model architectures (26M to 104M parameters), causal pretraining, full and LoRA instruction fine-tuning, Direct Preference Optimization (DPO), reasoning and thinking mode distillation, and converting checkpoints to GGUF, vLLM, or HuggingFace transformers formats. Route format-only skill linting to skill-standardization, LLM evaluation and RAG Triad benchmarking to trulens, and generic model serving deployment to deployment-automation.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 1.0.0
  source: https://github.com/jingyaogong/minimind
  upstream_commit: 233d00fa068ec2b8c0d4f07b703934d6391a5a73
---

# MiniMind

## When to use this skill

Use when designing, training, fine-tuning, evaluating, or deploying lightweight language models from scratch in PyTorch. MiniMind provides a minimalistic, transparent, and modular codebase for training 26M–104M parameter dense and Mixture-of-Experts (MoE) models on consumer hardware in hours, spanning causal pretraining, instruction tuning, DPO alignment, and reasoning distillation.

### Route-outs
- For validating Agent Skills specification format, frontmatter, or directory structure, use `skill-standardization`.
- For RAG Triad evaluation, feedback function tracking, and LLM benchmarking dashboards, use `trulens`.
- For serving models via cloud inference endpoints or Kubernetes clusters, use `deployment-automation` or `kagent`.
- For agent workflow planning or high-level reasoning task design, use `planning-with-reasoning`.

## Instructions

### 1. Offline environment and configuration preflight

Before launching memory-intensive GPU training sessions, run the offline preflight tool to inspect package dependencies and accelerator capabilities:

```bash
# General environment and hardware acceleration check
python3 "$SKILL_DIR/scripts/preflight.py" --json

# Inspect and estimate theoretical parameters for an LMConfig file
python3 "$SKILL_DIR/scripts/preflight.py" --config "/absolute/path/to/lmconfig.json" --json
```

The preflight tool checks PyTorch, transformers, and PEFT availability, detects CUDA/MPS compute devices, and estimates total parameter counts for both Dense and MoE configurations without initiating training or connecting to the network.

### 2. Configure model architecture (`LMConfig`)

Define model dimensions and hyperparameter configurations:

```python
from model.model import MiniMindLM, LMConfig

# Standard MiniMind-Small (approx. 26M parameters)
config = LMConfig(
    dim=512,
    n_layers=8,
    n_heads=8,
    n_kv_heads=8,
    vocab_size=6400,
    max_seq_len=512,
    use_moe=False
)
model = MiniMindLM(config)
```

For Mixture of Experts (MoE), set `use_moe=True`, specify `n_routed_experts=4`, and set `num_experts_per_tok=2` for top-2 dynamic gating with shared expert support.

### 3. Launch causal pretraining

Train base representations on raw tokenized text corpora:

```bash
# Single GPU pretraining
python train_pretrain.py --batch_size=32 --learning_rate=5e-4 --epochs=1

# Multi-GPU training with PyTorch DDP
torchrun --nproc_per_node=2 train_pretrain.py --batch_size=32 --learning_rate=5e-4
```

Pretraining utilizes the AdamW optimizer with cosine learning rate decay and linear warmup over causal next-token cross-entropy loss.

### 4. Supervised fine-tuning (Full & LoRA)

Teach the base model instruction-following conversational turns:

```bash
# Full parameter SFT
python train_full_sft.py --batch_size=16 --learning_rate=2e-5

# Parameter-efficient fine-tuning via LoRA (<4GB VRAM)
python train_lora.py --batch_size=16 --lora_rank=16
```

**Prompt Masking Requirement:** Always ensure prompt input tokens are assigned target label `-100` so that backpropagation loss updates are computed exclusively on the assistant's generated tokens.

### 5. Preference alignment with DPO

Align instruction-tuned checkpoints using Direct Preference Optimization on `{prompt, chosen, rejected}` dataset triplets:

```bash
python train_dpo.py --batch_size=8 --beta=0.1 --learning_rate=1e-6
```

DPO implicitly optimizes the policy model against a frozen reference checkpoint without training a separate reward model.

### 6. Exporting to GGUF and local edge inference

Export PyTorch weights for deployment with `llama.cpp` or Ollama:

```bash
# Export checkpoint to GGUF format
python export_model.py --checkpoint out/minimind_sft.pth --out_dir out/gguf/
```

Test interactive chat inference locally:

```bash
python eval_model.py --model_path out/minimind_sft.pth --load_mode=1
```

## Examples

### Complete training pipeline execution script

```bash
# 1. Verify environment
python3 "$SKILL_DIR/scripts/preflight.py"

# 2. Pretrain base model
python train_pretrain.py --dim=512 --n_layers=8 --epochs=1

# 3. Instruction tune with LoRA
python train_lora.py --checkpoint out/pretrain_512.pth --lora_rank=16

# 4. Interactive evaluation
python eval_model.py --checkpoint out/lora_sft.pth
```

### Initializing and inspecting MoE model in Python

```python
import torch
from model.model import MiniMindLM, LMConfig

moe_config = LMConfig(
    dim=512,
    n_layers=8,
    n_heads=8,
    vocab_size=6400,
    max_seq_len=512,
    use_moe=True,
    n_routed_experts=4,
    num_experts_per_tok=2
)

model = MiniMindLM(moe_config)
x = torch.randint(0, 6400, (1, 64))
logits, aux_loss = model(x)
print(f"Logits shape: {logits.shape}, Aux router loss: {aux_loss.item():.4f}")
```

## Best practices

1. **Perform preflight parameter sanity checks:** Use `scripts/preflight.py --config <file>` to verify layer and dimension calculations before allocating GPU memory.
2. **Mask prompt tokens during SFT:** Avoid computing loss over user instructions by masking input prompt tokens with `-100`.
3. **Use LoRA for consumer GPUs:** When working on hardware with 4GB–8GB VRAM, train LoRA adapters on `q_proj` and `v_proj` rather than full-parameter SFT to prevent out-of-memory errors.
4. **Include reasoning delimiters:** When training reasoning models, format responses with `<think>...</think>` tokens to allow structured deduction before final answers.

## References

- [MiniMind Architecture and MoE Engineering](references/architecture-and-moe.md): Detailed hyperparameter specifications, RMSNorm, RoPE, SwiGLU, and MoE routing.
- [Training Pipeline and Alignment](references/training-and-alignment.md): Pretraining, SFT, LoRA, DPO equations, and GGUF export.
- [Sources and Provenance](references/sources.md): Repository metadata, license, and architectural boundaries.
- [Evaluation Scenarios](evals/evals.json): Five behavioral evaluation prompts covering pretraining, LoRA, DPO, and export.
