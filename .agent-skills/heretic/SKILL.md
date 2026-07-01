---
name: heretic
description: >
  Run Heretic — a fully automatic directional-ablation ("abliteration") and LLM-interpretability
  toolkit that removes refusal/over-refusal behaviour from open-weight transformer models without
  post-training, and analyses the geometry of refusal directions. Use when the user wants to
  decensor / abliterate / un-refuse an open-weight model they have the right to modify, tune the
  ablation (KL-divergence target, trial budget, quantization), evaluate refusal-rate vs KL against
  the original, or do interpretability research (refusal-direction difference-of-means, residual
  geometry tables, PaCMAP residual plots). Packages p-e-w/heretic (AGPL-3.0). Triggers on: heretic,
  abliterate, abliteration, decensor / uncensor a model, remove refusals, refusal direction,
  directional ablation, residual geometry, plot residuals. Model discovery, harmful/harmless prompt
  datasets, and benchmark/prior-art research route web extraction through the `scrapling` skill.
  Simple "which uncensored model should I download" recommendations are answered directly.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Requires Python 3.10+ with PyTorch 2.2+ (2.6+ for MXFP4-quantized models such as gpt-oss) installed
  for your hardware; a CUDA GPU is strongly recommended (an RTX 3090 decensors a 4B model in ~20-30
  min). Install with `pip install -U heretic-llm` (or `uv run heretic`); the `[research]` extra adds
  PaCMAP/matplotlib for residual plots. bitsandbytes enables 4-bit quantization to fit larger models.
  Model discovery / dataset / benchmark web research uses the `scrapling` skill.
license: AGPL-3.0-or-later
metadata:
  tags: heretic, abliteration, directional-ablation, decensor, refusal-direction, interpretability, residual-geometry, llm-safety-research, optuna, scrapling
  version: "1.0"
  source: https://github.com/p-e-w/heretic
---

# heretic — Automatic Abliteration & Refusal-Direction Interpretability

> **Keyword**: `heretic` · `abliterate` · `decensor a model` · `remove refusals` · `refusal direction` · `plot residuals`
>
> **Responsible use.** Heretic is AGPL-3.0 software for research and for customizing models **you have
> the right to modify**. Respect each base model's license and every platform's Terms of Service when
> downloading, modifying, uploading, or serving weights. Abliteration lowers a model's refusal rate on
> *all* topics, including genuinely harmful ones — do not use it to produce a model for illegal content
> (e.g. CSAM, weapons-of-mass-destruction uplift, targeted harassment) or to evade safety controls you
> are contractually bound by. Legitimate uses include interpretability/alignment research, red-teaming,
> reducing benign over-refusal, and running uncensored models on your own hardware for lawful work.

heretic packages the [p-e-w/heretic](https://github.com/p-e-w/heretic) tool (AGPL-3.0) as an installable
jeo-skills plugin. Heretic implements a **parametrized variant of directional ablation** (abliteration,
after [Arditi et al. 2024](https://arxiv.org/abs/2406.11717)): it computes a per-layer "refusal
direction" as the difference-of-means between first-token residuals for *harmful* and *harmless* prompts,
then orthogonalizes the attention out-projection and MLP down-projection matrices against it — inhibiting
refusals **without any fine-tuning or post-training**. A **TPE optimizer (Optuna)** searches the ablation
kernel to minimize refusals while keeping KL-divergence from the original model low, so the process is
fully automatic and needs no configuration.

This skill is **routing-first**: pick the *smallest workable mode* for the request, keep the responsible-use
guardrails above in view, and route web-based discovery/research through `scrapling`.

---

## When to use / not use

**Use heretic when the user wants to:**

- Decensor / abliterate / un-refuse an open-weight model (Qwen, Llama, Gemma, gpt-oss, Mistral, …).
- Reduce **benign over-refusal** while preserving capability (low KL-divergence).
- Tune the ablation: trial budget, KL target, quantization to fit VRAM, chat/evaluate/upload after.
- Measure a model: refusal count on harmful prompts + KL-divergence vs the original.
- Do **interpretability research**: refusal-direction geometry, residual-geometry metrics, PaCMAP plots.

**Do NOT route here (answer directly or elsewhere):**

- "Recommend an already-uncensored model to download" → answer directly (point at HF `?other=heretic`).
- General LLM fine-tuning / RLHF / DPO → that is training, not ablation (different tools).
- Requests whose *only* plausible purpose is producing genuinely illegal/harmful content → decline.

---

## Modes (pick the smallest that satisfies the request)

| Mode | Trigger | Command / action |
| :--- | :--- | :--- |
| **decensor** *(default)* | "abliterate / decensor `<model>`" | `heretic <model>` — fully automatic; then choose save / upload / chat / evaluate |
| **configure** | "fit in 16GB", "more trials", "less brain damage" | edit `config.*.toml` or pass flags (`--quantization bnb_4bit`, `--n-trials`, `--kl-divergence-target`) |
| **evaluate** | "how censored is it / did it work" | `heretic --model <orig> --evaluate-model <candidate>` → refusals + KL |
| **research** | "plot residuals", "refusal geometry" | `pip install -U 'heretic-llm[research]'`; `--plot-residuals` / `--print-residual-geometry` |
| **discover** *(scrapling)* | "find a base model / existing heretic model / benchmarks" | route web extraction through `scrapling` (see below) |

Start narrow: an *evaluate* or *discover* request must **not** kick off a full multi-hour decensor run.

### decensor (default)

```sh
pip install -U heretic-llm          # or: uv run heretic  (pins uv.lock for reproducibility)
heretic Qwen/Qwen3-4B-Instruct-2507 # replace with any model you have the right to modify
```


The run is fully automatic: Heretic benchmarks the hardware to pick a batch size, computes refusal
directions, then runs the **Optuna TPE optimizer** (default `n_trials = 200`, `n_startup_trials = 60`)
to co-minimize (a) refusals on harmful prompts and (b) KL-divergence from the original on harmless
prompts. When it finishes you are offered: **save**, **upload to Hugging Face**, **chat** (test), and
**run benchmarks** — any combination. Checkpoints land in `checkpoints/` so a run can resume.

### configure

Fully automatic already works; reach for config only for hardware/quality control. Common knobs
(see `config.default.toml`, or the bundled presets `config.nohumor.toml` / `config.noslop.toml`):

- `quantization = "bnb_4bit"` — bitsandbytes 4-bit to fit larger models in less VRAM.
- `kl_divergence_target` (default `0.01`) — raise to allow deeper ablation, lower to protect capability.
- `n_trials` (default `200`) — more trials = better compliance/quality tradeoff, longer runtime.
- `dtypes`, `device_map`, `max_batch_size`, `max_response_length`, `refusal_markers`.

Run `heretic --help` for all CLI flags; any TOML key is also a `--kebab-case` flag.

### evaluate

Reproduce the metric table (refusals for harmful prompts / KL-divergence for harmless prompts) without
re-abliterating — e.g. to compare your output against an existing community model:

```sh
heretic --model google/gemma-3-12b-it --evaluate-model p-e-w/gemma-3-12b-it-heretic
```


Report **both** numbers: lower refusals = less censored; lower KL = less capability damage. A good
abliteration matches others' refusal suppression at a **much lower KL** (Heretic's headline result).

### research (interpretability)

```sh
pip install -U 'heretic-llm[research]'
heretic <model> --print-residual-geometry   # metrics table: cosine sims, norms, silhouette
heretic <model> --plot-residuals            # PaCMAP projection PNG per layer + animated GIF
```


`--print-residual-geometry` prints per-layer `S(g,b)`, `S(g*,b*)`, refusal-direction norms and the
silhouette coefficient of the harmful/harmless clusters (`g`=good/harmless mean, `b`=bad/harmful mean,
`*`=geometric median, `r = b − g` = refusal direction). `--plot-residuals` runs a PaCMAP projection
(CPU-heavy — an hour+ for large models) and renders a layer-by-layer residual animation.

### discover (route through `scrapling`)

For anything requiring the live web — locating a base model, checking whether a heretic/abliterated
version already exists, or pulling benchmark/prior-art numbers — **route to the `scrapling` skill** and
pick its lightest workable mode. See [references/research-and-scrapling.md](references/research-and-scrapling.md).

---

## How Heretic works (one screen)

1. **Refusal directions.** For each layer, mean first-token residual for harmful prompts minus that for
   harmless prompts (`r = b − g`). A **float** `direction_index` interpolates between adjacent layers'
   directions, unlocking directions no single layer provides.
2. **Ablation.** Orthogonalize attention out-projection and MLP down-projection against `r`. A flexible
   per-component **weight kernel** (`max_weight`, `max_weight_position`, `min_weight`,
   `min_weight_distance`) shapes how strongly each layer is ablated.
3. **Optimize.** Optuna TPE searches kernel + direction params to minimize refusals **and** KL-divergence
   simultaneously. Attention and MLP get separate parameters (MLP interventions are more damaging).

Detail: [references/abliteration-and-optimization.md](references/abliteration-and-optimization.md) ·
CLI/config: [references/cli-and-config.md](references/cli-and-config.md).

---

## Workflow

1. **Classify the request** → mode (`decensor` / `configure` / `evaluate` / `research` / `discover`).
   Recommendation-only or clearly-illegal-purpose requests do **not** launch a run.
2. **Confirm rights & hardware.** The model must be one the user may modify; confirm a GPU + enough
   VRAM (offer `--quantization bnb_4bit` when tight). Warn on multi-hour runtimes / PaCMAP cost.
3. **Discover (if needed) via `scrapling`** — base model, existing heretic version, benchmark baselines.
4. **Install & run** the smallest command for the mode. Prefer `uv run heretic` for reproducibility.
5. **Report metrics** — refusals + KL, checkpoint/plot paths — and the follow-up options
   (save / upload / chat / evaluate / benchmark).

---

## Error handling & gotchas

- **`torch.accelerator` / MXFP4 errors** (e.g. gpt-oss) → PyTorch **2.6+** required; upgrade torch.
- **CUDA OOM** → set `quantization = "bnb_4bit"`, lower `max_batch_size`, or pick a smaller model.
- **PaCMAP is slow** → it runs on CPU; an hour+ for large models is expected, not a hang.
- **Research features missing** → install the `[research]` extra (`pip install -U 'heretic-llm[research]'`).
- **Non-deterministic metrics** → refusal/KL numbers are platform- and hardware-dependent; report the env.
- **Over-ablation (broken/incoherent model)** → lower `kl_divergence_target`, raise `n_trials`, or reduce
  MLP ablation weights; re-`evaluate` before shipping.

## Follow-ups

- "Fit it in my VRAM" → `--quantization bnb_4bit` + lower batch size (configure).
- "It's still refusing" → raise `kl_divergence_target` / `n_trials`, or check the refusal markers (configure).
- "Prove it works" → `--evaluate-model` against the original + a known-good community model (evaluate).
- "Show me the refusal geometry" → `[research]` extra + `--print-residual-geometry` / `--plot-residuals`.
- "Is there already a heretic version?" → `scrapling` HuggingFace `?other=heretic` search (discover).

---

## Install

```sh
# As a jeo-skills plugin (routing skill):
npx skills add https://github.com/akillness/jeo-skills --skill heretic
```

# Install the Heretic tool itself into a Python env (PyTorch 2.2+ preinstalled):
bash scripts/install.sh                    # pip install -U heretic-llm (+ [research] with RESEARCH=1)
RESEARCH=1 bash scripts/install.sh         # include interpretability extras
UV=1 bash scripts/install.sh               # clone repo + `uv sync` for pinned, reproducible deps


See [references/install.md](references/install.md) for env knobs and reproducible (uv.lock) setup.

## Bundled references

- [references/abliteration-and-optimization.md](references/abliteration-and-optimization.md) — the algorithm, kernel params, Optuna objective.
- [references/cli-and-config.md](references/cli-and-config.md) — flags, `config.*.toml` keys, presets, quantization.
- [references/research-and-scrapling.md](references/research-and-scrapling.md) — interpretability features + the `scrapling` discovery route.
- [references/install.md](references/install.md) — pip vs uv, PyTorch/CUDA/bitsandbytes prerequisites, responsible-use.

**Upstream**: <https://github.com/p-e-w/heretic> (AGPL-3.0-or-later, © 2025-2026 Philipp Emanuel Weidmann + contributors).
