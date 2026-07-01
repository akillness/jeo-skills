# CLI & configuration

Heretic is fully automatic (`heretic <model>`), but every behaviour is configurable via CLI flags or a
TOML file. Run `heretic --help` for the authoritative flag list; any `config.default.toml` key is also a
`--kebab-case` command-line flag.

## Basic invocations

```sh
heretic Qwen/Qwen3-4B-Instruct-2507                 # decensor, fully automatic
heretic <model> --quantization bnb_4bit             # 4-bit to fit larger models in less VRAM
heretic <model> --n-trials 400                      # bigger Optuna search (slower, better tradeoff)
heretic <model> --kl-divergence-target 0.005        # protect capability harder (less ablation)
heretic --model <orig> --evaluate-model <candidate> # measure refusals + KL, no re-abliteration
heretic <model> --config config.noslop.toml         # use a bundled preset
```


After a decensor run finishes, Heretic interactively offers: **save**, **upload to Hugging Face**,
**chat** (test the model), and **run benchmarks** — any combination.

## Key config keys (`config.default.toml`)

| Key | Default | Purpose |
| :--- | :--- | :--- |
| `dtypes` | `["auto","float16","bfloat16","float32"]` | candidate compute dtypes |
| `quantization` | `"none"` | set `"bnb_4bit"` for bitsandbytes 4-bit (much less VRAM) |
| `device_map` | `"auto"` | HF device placement |
| `offload_outputs_to_cpu` | `true` | move outputs off-GPU to save VRAM |
| `batch_size` | `0` (auto) | `0` = benchmark & pick; capped by `max_batch_size` |
| `max_batch_size` | `128` | upper bound for the auto batch-size search |
| `max_response_length` | `100` | tokens generated when probing refusals |
| `kl_divergence_target` | `0.01` | KL budget in the objective (lower = safer capability) |
| `kl_divergence_scale` | `1.0` | weight of the KL term |
| `n_trials` | `200` | Optuna trials (more = better tradeoff, slower) |
| `n_startup_trials` | `60` | random startup trials before TPE kicks in |
| `orthogonalize_direction` | `true` | orthogonalize the refusal direction |
| `row_normalization` | `"full"` | matrix row normalization mode |
| `full_normalization_lora_rank` | `3` | rank for full normalization |
| `winsorization_quantile` | `1.0` | outlier clipping quantile |
| `study_checkpoint_dir` | `"checkpoints"` | resume/checkpoint location |
| `max_shard_size` | `"5GB"` | shard size when saving |
| `refusal_markers` | list | strings that mark a refusal (`"sorry"`, `"i cannot"`, …) |
| `chain_of_thought_skips` | list | tag pairs to skip reasoning blocks (`<think>`, gpt-oss channels, `[THINK]`) |

Interpretability toggles (need the `[research]` extra): `print_residual_geometry`, `plot_residuals`,
`residual_plot_path`, `residual_plot_title`, `residual_plot_style`, plus `print_responses` /
`print_debug_information` for verbose runs.

## Bundled presets

The upstream repo ships alternative configs you can pass with `--config`:

- `config.default.toml` — the documented defaults above.
- `config.noslop.toml` — tuned to reduce "slop"/filler phrasing.
- `config.nohumor.toml` — tuned against forced jokey tone.

## Quantization to fit VRAM

Set `quantization = "bnb_4bit"` (or `--quantization bnb_4bit`) to load the model with bitsandbytes 4-bit,
drastically cutting VRAM so larger models fit on consumer GPUs. Combine with a lower `max_batch_size` if
you still OOM.

## Runtime expectations

On an RTX 3090 with defaults, decensoring a 4B model (e.g. Qwen3-4B-Instruct-2507) takes ~20-30 minutes.
Larger models, more `n_trials`, and residual plotting (PaCMAP on CPU) increase this substantially.
