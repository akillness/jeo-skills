# How Heretic works — directional ablation & optimization

Heretic implements a **parametrized variant of directional ablation** ("abliteration"), following
[Arditi et al. 2024](https://arxiv.org/abs/2406.11717), and adds automatic parameter optimization.
Nothing here is fine-tuning: it edits weight matrices directly, so a run is minutes-to-hours, not a
training job.

## 1. Refusal directions (difference-of-means)

For each transformer layer, Heretic computes the **first-token residual vectors** (hidden states) for a
set of *harmful* and a set of *harmless* example prompts, then takes the difference of means:

- `g`  = mean residual for **good/harmless** prompts
- `b`  = mean residual for **bad/harmful** prompts
- `g*`, `b*` = the corresponding **geometric medians**
- `r  = b − g`   → the **refusal direction** (means)
- `r* = b* − g*` → the refusal direction from geometric medians

Suppressing the expression of `r` in the model's activations inhibits the "I can't help with that"
behaviour.

## 2. Ablation (orthogonalization)

For each supported component — currently the **attention out-projection** and the **MLP down-projection**
— Heretic orthogonalizes the weight matrix against the relevant refusal direction, so multiplying by that
matrix no longer produces a component along `r`.

The strength of ablation per layer is set by a **weight kernel** with four shape parameters:

| Param | Meaning |
| :--- | :--- |
| `max_weight` | peak ablation strength |
| `max_weight_position` | layer (fractional) where the peak sits |
| `min_weight` | floor ablation strength |
| `min_weight_distance` | how far from the peak the weight decays to the floor |

Kernels are chosen **separately for attention vs MLP** — MLP interventions tend to damage the model more,
so decoupling lets the optimizer ablate attention harder and MLP gentler.

## 3. Heretic's innovations over prior abliteration

- **Flexible kernel shape** — non-constant ablation weight across layers (vs a single global scale),
  which combined with optimization improves the compliance/quality tradeoff.
- **Float `direction_index`** — instead of picking one layer's refusal direction, the index is a float;
  non-integral values linearly interpolate the two nearest directions, unlocking directions no single
  layer provides. `direction_index = "per layer"` ablates each layer with its own direction.
- **Per-component parameters** — attention and MLP get independent kernel + direction settings.

## 4. Automatic optimization (Optuna TPE)

Heretic wraps all of the above in a **TPE-based parameter optimizer powered by [Optuna](https://optuna.org/)**.
The objective jointly minimizes:

1. **Refusals** — how often the model still refuses the harmful prompt set (lower = less censored), and
2. **KL-divergence** — divergence of the ablated model's output distribution from the original on the
   *harmless* prompt set (lower = less capability damage).

Relevant defaults (`config.default.toml`):

- `n_trials = 200`, `n_startup_trials = 60` — search budget.
- `kl_divergence_target = 0.01`, `kl_divergence_scale = 1.0` — the KL side of the objective.
- `orthogonalize_direction = true`, `row_normalization = "full"`, `full_normalization_lora_rank = 3`,
  `winsorization_quantile = 1.0`.
- `study_checkpoint_dir = "checkpoints"` — trials are checkpointed so a run can resume.

At startup Heretic **benchmarks the hardware** to choose an optimal `batch_size` (`batch_size = 0` = auto,
capped by `max_batch_size = 128`).

## 5. Why the result is good

Because the optimizer explicitly trades refusal suppression against KL-divergence, an unsupervised
Heretic run can match hand-crafted abliterations' refusal rates at **substantially lower KL** — i.e. the
same "uncensoring" with less damage to the model's general capabilities. Verify this per model with the
`evaluate` mode and report **both** numbers.
