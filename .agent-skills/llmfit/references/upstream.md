# llmfit pinned operator reference

This reference preserves the audited llmfit operator surface at upstream commit `4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e` (MIT). It is consulted on demand; the local `scripts/preflight.py` is offline-only and never invokes these commands.

## Command matrix

| Command | Use | Side-effect boundary | Evidence class |
| --- | --- | --- | --- |
| `llmfit --version`, `llmfit --help` | establish binary and supported flags | read-only | observed CLI metadata |
| `llmfit system --json` | capture detected host hardware | read-only | observed host data |
| `llmfit doctor` | diagnose a requested detection/runtime problem | read-only | diagnostic report, not a benchmark |
| `llmfit recommend --json --limit N [--use-case coding\|reasoning\|chat\|multimodal\|embedding]` | rank catalog models | read-only | formula-based fit/rank estimate |
| `llmfit fit --json -n N` | list fit rows | read-only | formula-based fit estimate |
| `llmfit info "MODEL"` | explain quantization, run mode, fit, estimate basis, and verification commands | read-only | model/catalog estimate |
| `llmfit plan "MODEL" --context 8192 --json [--quant QUANT] [--target-tps N] [--max-context N]` | estimate `gpu`, `cpu_offload`, and `cpu_only` feasibility, disk-size, and upgrade deltas | read-only | plan arithmetic, never throughput proof |
| `llmfit storage --keep 3 --selection score\|largest --json` | estimate SSD tiers from catalog disk sizes, OS reserve, scratch, and headroom | read-only | capacity arithmetic; does not inspect free disk, download files, concurrent serving, or replicated cluster storage |
| `llmfit hardware list --json` | enumerate reusable hardware profiles | read-only | profile catalog |
| `llmfit hardware validate ./box.json` | validate a profile before speed-relevant simulation | read-only | profile validation |
| `llmfit --profile ./box.json recommend --json` | rank against validated speed-relevant profile | read-only | formula-based estimate |
| `llmfit --memory=24G --ram=64G --cpu-cores=8 fit --json -n 10` | simulate capacity with global overrides | read-only | formula-based capacity estimate |
| `llmfit --memory-percent=90 --ram-percent=75 fit --json -n 10` | simulate percentage capacity overrides | read-only | formula-based capacity estimate |
| `llmfit serve --host 127.0.0.1 --port 8787` | bind the local REST service | **starts a local service; approval required** | runtime API, not measured inference |
| `GET /health`, `/api/v1/system`, `/api/v1/models`, `/api/v1/models/top`, `/api/v1/models/{name}`, `/api/v1/runtimes`, `/api/v1/installed` | query a running loopback service | read-only after approved launch | API response; fit values remain estimates |
| `POST /api/v1/plan` with `{model, context, quant?, target_tps?, kv_quant?, ram_gb?, vram_gb?, cpu_cores?}` | loopback-only plan estimate | read-only after approved launch | plan estimate |
| `POST /api/v1/download`, TUI downloads | pull a provider/model artifact | **loopback-restricted network/provider side effect; separate approval; poll `/api/v1/download/{id}/status` after approval** | not a fit measurement |
| `llmfit bench` | measure a running Ollama/vLLM/Ferrum/MLX/llama-server provider | **executes runtime work; separate approval** | measured only when the benchmark reports measurement |
| `llmfit bench --all --share --dry-run` | preview a community-share payload | no publish, but inspect payload | preview only |
| `llmfit bench --share` | create or update a GitHub PR | **credentials/network/PR side effect; separate approval** | community submission, not local fit proof |

`--profile` conflicts with memory/RAM/CPU override flags and `--force-runtime`; use a validated profile when bandwidth or compute speed affects the estimate.
Do not use `--share` or `--yes` implicitly. Do not run installers, package managers, `cargo build`, container pulls, provider downloads, or model downloads as part of a read-only fit request.

## Hardware and platform matrix

| Host/platform | Detection rule from the pinned source | Safe interpretation |
| --- | --- | --- |
| Linux + NVIDIA | probes `nvidia-smi`; may also inspect sysfs/`lspci` and `npu-smi` | report detected hardware only; missing tools mean incomplete detection |
| Linux + AMD | probes `rocm-smi`; may inspect sysfs/`lspci` | report observed device and available memory only |
| Apple Silicon/macOS | uses `system_profiler`; unified RAM is reported as VRAM | RAM/VRAM is shared capacity, not a dedicated GPU guarantee |
| Windows | reports RAM/CPU; NVIDIA only when `nvidia-smi` exists | no GPU claim without observed `nvidia-smi` evidence |
| Android/Termux/PRoot | CPU/RAM detection may work | GPU autodetection is unsupported; do not infer GPU readiness |

The helper's host inventory may report OS, architecture, Python, and whether an `llmfit` executable is discoverable. It does not run `llmfit`, `system_profiler`, `nvidia-smi`, `rocm-smi`, providers, or servers.

## Fit threshold matrix

The source fit ratio is `memory_required / memory_available`:

| Ratio | Fit level | Interpretation |
| ---: | --- | --- |
| `<= 0.60` | `Perfect` | fit pressure only; not a quality or speed guarantee |
| `<= 0.85` | `Good` | fit pressure only; not a quality or speed guarantee |
| `<= 0.98` | `Marginal` | tight capacity; do not imply reliability |
| `> 0.98` | `Too Tight` | not a runnable claim |

`recommended_ram_gb` does not determine the verdict and cannot upgrade every row to `Perfect`. MoE offload, CPU+GPU offload, and CPU-only paths are capped at `Good`; only fully GPU-resident paths can be `Perfect`.

## Estimate versus measurement boundary

- Recognized GPU bandwidth uses a roofline estimate; unknown GPUs fall back to backend constants.
- Prefill and TTFT are `null` unless `gpu_compute_tflops_fp16` is known.
- Memory estimates include model and KV assumptions but not actual allocator behavior, runtime caches, auxiliary files, or concurrent serving.
- Catalog weights are approximate, especially for MoE. Keep quantization and context fixed when comparing `plan` and `fit`.
- `estimate_confidence` and `estimate_basis` describe the formula's inputs; they are not benchmark confidence.
- Estimated tok/s, prefill, or TTFT must never be reported as measured inference. A measured claim requires an approved provider run through `llmfit bench` (or another explicitly identified benchmark) and its output evidence.

## Local API filters

When a loopback service has been explicitly approved, model queries may use `min_fit`, `perfect`, `runtime`, `use_case`, `provider`, `search`, `sort`, `include_too_tight`, `max_context`, `force_runtime`, `license`, and `ram_gb`/`vram_gb`/`cpu_cores` overrides. Overrides affect fit arithmetic, not measured host performance.

## Pinned source citations

- CLI surface: [`docs/cli.md`](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/cli.md)
- Scoring/estimation: [`docs/how-it-works.md`](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/how-it-works.md)
- Platform limits: [`docs/platform-support.md`](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/platform-support.md)
- API routes: [`serve_api.rs`](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/llmfit-tui/src/serve_api.rs)
- Fit implementation: [`fit.rs`](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/llmfit-core/src/fit.rs)
- License: [`LICENSE`](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/LICENSE)
