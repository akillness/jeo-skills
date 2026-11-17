# MiniMind Training Pipeline and Alignment Reference

## 1. End-to-End Four-Phase Training Workflow

MiniMind structures full model lifecycle training into four sequential stages:

```
[Raw Corpus] ---> Pretraining (train_pretrain.py) ---> Base Checkpoint
                                                             |
                                                             v
[Instruction QA] ---> Full SFT / LoRA (train_full_sft.py) ---> Instruct Checkpoint
                                                             |
                                                             v
[Chosen vs Rejected] ---> DPO (train_dpo.py) ---------------> Aligned Checkpoint
                                                             |
                                                             v
[Reasoning Chains] ----> Reasoning Distillation ------------> Thinking Checkpoint
```

### Phase 1: Pretraining (`train_pretrain.py`)
- **Objective:** Causal next-token prediction on raw text corpora.
- **Dataset:** Tokenized text arrays (e.g. `pretrain_data.bin`).
- **Loss Masking:** Causal cross-entropy over all sequence tokens.
- **Hyperparameters:**
  - Optimizer: `AdamW(lr=5e-4, betas=(0.9, 0.95), weight_decay=0.1)`
  - Scheduler: Linear warmup (2000 steps) followed by Cosine Decay down to $0.1 \times \text{lr}$.

### Phase 2: Supervised Fine-Tuning (SFT) (`train_full_sft.py`)
- **Objective:** Teach the model conversational turns and instruction following.
- **Prompt Masking:** Target loss is computed **only on assistant response tokens**; user query tokens are assigned label `-100` to prevent learning prompt artifacts.

### Phase 3: LoRA Fine-Tuning (`train_lora.py`)
- **Target Modules:** Low-Rank Adaptation injected into `q_proj` and `v_proj` attention weights:
  $$\Delta W = B \cdot A, \quad A \in \mathbb{R}^{r \times d}, B \in \mathbb{R}^{d \times r}, \quad r \in [8, 32]$$
- **Resource Footprint:** Trains $<1\%$ of total parameters, allowing SFT on consumer GPUs with under 4GB VRAM.

### Phase 4: Direct Preference Optimization (DPO) (`train_dpo.py`)
- **Objective:** Align model responses against human preferences without training an explicit reward model.
- **Input Format:** Triplet records: `{ "prompt": str, "chosen": str, "rejected": str }`.
- **DPO Loss:**
  $$\mathcal{L}_{\text{DPO}}(\theta; \pi_{\text{ref}}) = -\mathbb{E}_{(x, y_w, y_l)} \left[ \log \sigma \left( \beta \log \frac{\pi_\theta(y_w|x)}{\pi_{\text{ref}}(y_w|x)} - \beta \log \frac{\pi_\theta(y_l|x)}{\pi_{\text{ref}}(y_l|x)} \right) \right]$$
  Typically configured with temperature $\beta \in [0.1, 0.5]$.

---

## 2. Reasoning and Thinking Mode Integration

MiniMind implements explicit Chain-of-Thought reasoning distillation:

- **Special Tokens:** `<think>` and `</think>` delimit internal deduction paths before final user output:
  ```
  <think>
  1. Identify the input query requirements...
  2. Evaluate edge conditions...
  </think>
  Here is the final verified answer.
  ```
- **Distillation:** SFT training incorporates step-by-step reasoning solutions synthesized from frontier reasoning models (such as DeepSeek-R1), enabling small models to exhibit structured problem-solving.

---

## 3. Distributed Training and Checkpoint Export

### Multi-GPU Launch with PyTorch DDP
```bash
# Launch distributed pretraining across 2 local GPUs
torchrun --nproc_per_node=2 train_pretrain.py --batch_size=32 --learning_rate=5e-4
```

### Export to GGUF and llama.cpp
MiniMind checkpoints (`.pth` or `.bin`) can be converted to GGUF format for edge deployment:
```bash
# Export PyTorch weights to GGUF format
python export_model.py --checkpoint out/minimind_sft.pth --out_dir out/gguf/
```
GGUF models can be quantized to `Q4_K_M` or `Q8_0` and run directly inside `llama.cpp` or Ollama.
