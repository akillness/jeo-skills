---
name: llmfit
description: Operate AlexsJones/llmfit to inspect detected hardware, rank model fit, estimate plans and storage, run the local REST API, and separate formula-based estimates from measured inference. Use when a user asks what LLMs fit a machine, how much RAM/VRAM a model needs, which runtime is plausible, or whether a result is measured versus estimated. Do not use this skill to install binaries, pull models, benchmark a provider, or submit community results without explicit approval.
allowed-tools: Bash Read
compatibility: Requires a llmfit binary or source checkout; GPU/runtime availability is host-dependent.
license: MIT
metadata:
  version: "1.1.0"
  source: https://github.com/AlexsJones/llmfit
  upstream_commit: 4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e
---

# llmfit operator

## When to use this skill

Use this skill for source-grounded, node-local model-fit decisions: hardware inventory, fit verdicts, score/ranking output, hardware profiles, plan and storage estimates, and read-only REST queries. It keeps formula-based estimates separate from measured inference.

Route generic service or inference performance tuning to `performance-optimization`. This checkout has no separate `lmstudio-cli` or `typesafe-ai` skill; treat those names only as llmfit provider/API values and use the pinned reference when needed.

## Instructions

1. **Run the offline gate first.** From the repository root run `python3 .agent-skills/llmfit/scripts/preflight.py --json`; from an installed skill root run `python3 "$SKILLS_ROOT/llmfit/scripts/preflight.py" --json`. Add `--repo PATH --expect-commit FULL_SHA` only when checking a supplied source checkout. The helper never starts llmfit or invokes network/provider work.
2. **Establish binary and scope.** Run `llmfit --version` and `llmfit --help`; if unavailable, stop at an install/source-build handoff. Do not run an installer, package manager, `cargo build`, container pull, or model download without explicit approval.
3. **Capture read-only hardware evidence.** Run `llmfit system --json`; use `llmfit doctor` only for a diagnostic request. Load [references/upstream.md](references/upstream.md) for the pinned platform probe and capability matrix.
4. **Run a static fit query.** Prefer `llmfit recommend --json --limit N` (optionally a supported `--use-case`) or `llmfit fit --json -n N`; use `llmfit info "MODEL"` for one row. Keep tok/s, prefill, and TTFT labeled as estimates unless output explicitly reports measured confidence.
5. **Apply the source thresholds.** `memory_required / memory_available` gives Perfect at ≤0.60, Good at ≤0.85, Marginal at ≤0.98, and Too Tight above 0.98. `recommended_ram_gb` does not alter the verdict; offload paths cap at Good, and Too Tight is not a runnable claim. Consult the reference for estimation caveats.
6. **Compare capacity and plans consistently.** Use global capacity overrides before `fit`, or a validated hardware profile for speed-relevant simulation. For a named model use `llmfit plan "MODEL" --context 8192 --json`, keeping quantization/context fixed when comparing `plan` and `fit`. Storage output is capacity arithmetic, not free-disk evidence.
7. **Keep API and side effects distinct.** A loopback `serve` plus GET routes is read-only after an approved launch; `/api/v1/plan` is still an estimate. Downloads, TUI/provider pulls, `llmfit bench`, credentials/network, and `--share` PR creation require separate approval; use the pinned dry-run command for share payload preview.
8. **Return an evidence-backed conclusion.** Include exact commands, host/profile/override inputs, model/quant/context, fit level/run mode, estimate basis/confidence, and whether a measured run occurred. Never report estimated throughput as a benchmark.

## Examples

```sh
# Offline inventory before any upstream command
python3 .agent-skills/llmfit/scripts/preflight.py --json

# Read-only host inventory and top coding candidates
llmfit system --json
llmfit recommend --json --use-case coding --limit 5

# Capacity simulation and one reproducible model plan
llmfit --memory=24G --ram=64G --cpu-cores=16 fit --json -n 10
llmfit plan "Qwen/Qwen3-4B-MLX-4bit" --context 8192 --json
```

## Best practices

- Preserve raw JSON alongside summaries as the audit trail for detected hardware and estimate provenance.
- Prefer validated profiles over capacity flags when memory bandwidth or fp16 throughput matters.
- Treat Perfect/Good/Marginal as fit pressure, not quality or speed guarantees; report run mode and confidence.
- Keep `doctor` for bug reports and API access loopback-only unless an approved design says otherwise.

## References

- [Pinned llmfit command, hardware, threshold, estimate, API, and safety matrix](references/upstream.md)
- [Upstream CLI documentation at the pinned commit](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/cli.md)
- [Upstream scoring and estimate model](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/how-it-works.md)
- [Upstream platform limits](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/docs/platform-support.md)
- [Upstream MIT license](https://raw.githubusercontent.com/AlexsJones/llmfit/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e/LICENSE)
