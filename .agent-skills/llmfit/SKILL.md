---
name: llmfit
description: Operate AlexsJones/llmfit to inspect detected hardware, rank model fit, estimate plans and storage, run the local REST API, and separate formula-based estimates from measured inference. Use when a user asks what LLMs fit a machine, how much RAM/VRAM a model needs, which runtime is plausible, or whether a result is measured versus estimated. Do not use this skill to install binaries, pull models, benchmark a provider, or submit community results without explicit approval.
allowed-tools: Bash Read
compatibility: Requires a llmfit binary or source checkout; GPU/runtime availability is host-dependent.
metadata:
  version: "1.0"
  source: https://github.com/AlexsJones/llmfit
  upstream_commit: 4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e
---

# llmfit operator

## When to use this skill

Use this skill for source-grounded, node-local model-fit decisions. It owns llmfit's hardware probes, fit verdicts, score/ranking output, hardware profiles, plan estimates, storage estimates, and read-only REST queries. It does **not** turn an estimate into a measured performance claim.

Route generic performance tuning to the catalog's `performance-optimization` skill. There is no `lmstudio-cli` or `typesafe-ai` entry in this checkout; describe those runtimes only as llmfit provider/API values and link the upstream docs instead of routing to a missing skill.

## Instructions

1. **Establish the binary and scope.** Run `llmfit --version` and `llmfit --help`; if unavailable, stop at an install/source-build handoff. Do not run the upstream installer, package manager, `cargo build`, container pull, or model download unless the user explicitly approves that side effect.
2. **Capture read-only hardware evidence first.** Run `llmfit system --json`; use `llmfit doctor` only when a diagnostic report is requested. Detection is best-effort: Linux probes `nvidia-smi`, `rocm-smi`, sysfs/`lspci`, and `npu-smi`; Apple Silicon uses `system_profiler` and reports unified RAM as VRAM. Windows gets RAM/CPU and NVIDIA only when `nvidia-smi` exists. Android/Termux/PRoot CPU/RAM detection may work, but GPU autodetection is not supported.
3. **Run a static fit query.** Prefer `llmfit recommend --json --limit N` (optionally `--use-case coding|reasoning|chat|multimodal|embedding`) or `llmfit fit --json -n N`. `llmfit info "MODEL"` explains the selected quantization, run mode, fit level, estimate basis, and verification commands. Treat all tok/s, prefill, and TTFT values as estimates unless the output explicitly reports measured confidence.
4. **Interpret fit correctly.** Current source scores `memory_required / memory_available`: ≤0.60 is Perfect, ≤0.85 Good, ≤0.98 Marginal, and >0.98 Too Tight. `recommended_ram_gb` does not affect the verdict. MoE offload, CPU+GPU offload, and CPU-only paths are capped at Good; only fully GPU-resident paths can be Perfect. Too Tight rows are not runnable claims.
5. **State estimation limits.** Recognized GPU bandwidth uses a roofline estimate; unknown GPUs fall back to backend constants. Prefill/TTFT are `null` unless `gpu_compute_tflops_fp16` is known. Memory estimates include model/KV assumptions but not actual allocator behavior, runtime caches, auxiliary files, or concurrent serving. Compare `plan` and `fit` with the same quantization/context; catalog weights are approximate, especially for MoE.
6. **Simulate another machine explicitly.** For capacity-only corrections use global flags before the subcommand, e.g. `llmfit --memory=24G --ram=64G --cpu-cores=8 fit --json -n 10` or `--memory-percent=90 --ram-percent=75`. For speed-relevant simulation use a validated profile: `llmfit hardware list --json`, `llmfit hardware validate ./box.json`, then `llmfit --profile ./box.json recommend --json`. `--profile` conflicts with memory/RAM/CPU override flags and with `--force-runtime`.
7. **Estimate a named model plan.** Run `llmfit plan "MODEL" --context 8192 --json`, adding `--quant QUANT`, `--target-tps N`, or `--max-context N` only when requested. Report per-path feasibility (`gpu`, `cpu_offload`, `cpu_only`), disk-size estimate, and upgrade deltas as planning output—not proof that a runtime will achieve target tok/s.
8. **Use storage planning as capacity arithmetic only.** `llmfit storage --keep 3 --selection score|largest --json` estimates SSD tiers from catalog disk sizes, OS reserve, scratch, and headroom. It does not inspect free disk, download files, estimate concurrent serving, or account for replicated cluster storage.
9. **Separate read-only API from side effects.** `llmfit serve --host 127.0.0.1 --port 8787` binds a local service. Query `GET /health`, `/api/v1/system`, `/api/v1/models`, `/api/v1/models/top`, `/api/v1/models/{name}`, `/api/v1/runtimes`, and `/api/v1/installed`. Query filters include `min_fit`, `perfect`, `runtime`, `use_case`, `provider`, `search`, `sort`, `include_too_tight`, `max_context`, `force_runtime`, `license`, and `ram_gb`/`vram_gb`/`cpu_cores` overrides. `POST /api/v1/plan` is a loopback-only estimate with `{model, context, quant?, target_tps?, kv_quant?, ram_gb?, vram_gb?, cpu_cores?}`.
10. **Gate every side-effect branch.** `POST /api/v1/download` starts a provider pull and is loopback-restricted; poll `/api/v1/download/{id}/status`. TUI downloads, provider pulls, and `llmfit bench` execute real runtime work. `llmfit bench` measures a running Ollama/vLLM/Ferrum/MLX/llama-server provider; `--share` creates or updates a GitHub PR and needs credentials/network. Use `llmfit bench --all --share --dry-run` for a payload preview, and never use `--share`/`--yes` without explicit approval.
11. **Return an evidence-backed conclusion.** Include the exact command, host/profile/override inputs, model/quant/context, fit level and run mode, `estimate_confidence`/`estimate_basis` when present, and whether any measured run occurred. Never call an estimated tok/s a benchmark result.

## Examples

```sh
# Read-only host inventory and top coding candidates
llmfit system --json
llmfit recommend --json --use-case coding --limit 5

# Capacity simulation (not measured throughput)
llmfit --memory=24G --ram=64G --cpu-cores=16 fit --json -n 10

# Reproducible plan for one model
llmfit plan "Qwen/Qwen3-4B-MLX-4bit" --context 8192 --json

# Local API read-only checks
llmfit serve --host 127.0.0.1 --port 8787
curl http://127.0.0.1:8787/health
curl 'http://127.0.0.1:8787/api/v1/models/top?limit=5&min_fit=good&use_case=coding'
```

## Best practices

- Preserve raw JSON alongside any summary; it is the audit trail for detected hardware and estimate provenance.
- Prefer profiles over a pile of capacity flags when memory bandwidth or fp16 throughput matters.
- Keep context and quantization fixed when comparing models or comparing `plan` with `fit`.
- Treat `Perfect`/`Good`/`Marginal` as fit pressure, not quality or speed guarantees; report the run mode and confidence.
- Use `doctor` for bug reports, not as a substitute for a measured inference benchmark.
- Keep API bound to loopback unless an approved scheduler/network design requires exposure; downloads remain local-only by implementation.

## References

- Pinned CLI/API and profile reference: [docs/cli.md](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/cli.md)
- Pinned scoring and estimate model: [docs/how-it-works.md](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/how-it-works.md)
- Pinned platform limits: [docs/platform-support.md](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/platform-support.md)
- Pinned API route implementation: [serve_api.rs](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/llmfit-tui/src/serve_api.rs)
- Pinned fit implementation: [fit.rs](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/llmfit-core/src/fit.rs)
- License: [MIT](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/LICENSE)
