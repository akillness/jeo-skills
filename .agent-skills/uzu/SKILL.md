---
name: uzu
description: >
  Operate trymirai/uzu, Mirai's Rust-native local inference engine, on supported Apple
  Silicon or CPU-oriented source targets. Use when a user needs Uzu preflight, the `mirai`
  CLI, a pinned source checkout, local model acquisition, chat/server operation, benchmarking, or model-license
  and platform-fit guidance. Do not route llama.cpp, LM Studio, arbitrary GGUF conversion,
  CUDA/Linux-GPU claims, or unverified Windows production support here.
allowed-tools: Bash Read
compatibility: Requires Python 3.10+ for the offline preflight helper; source builds require the pinned repository's Rust toolchain. The primary runtime is Apple Silicon macOS with Metal; other source targets are CPU-oriented and/or in progress.
metadata:
  version: "1.1.0"
  source: https://github.com/trymirai/uzu
  upstream_commit: d76d468a1898cacc9c4920accf8f5ff099967107
---

# Uzu operator

## When to use this skill

Use this skill for **trymirai/uzu** operations: host/tool availability checks, the published
`mirai` CLI, a source checkout pinned to the reviewed commit, local chat or an OpenAI-compatible
server, a local benchmark, and model-resource/license decisions. It is not a generic local-LLM
router. If the request names llama.cpp or LM Studio, route to that product's skill; if it asks
for arbitrary GGUF conversion, route to a conversion-specific skill.

## Instructions

1. Run the side-effect-free helper before choosing a path:
   ```sh
   python3 .agent-skills/uzu/scripts/preflight.py --json
   ```
   From an installed skill root, use:
   ```sh
   python3 "$SKILLS_ROOT/uzu/scripts/preflight.py" --json
   ```
   Add `--repo PATH --expect-commit d76d468a1898cacc9c4920accf8f5ff099967107` only when a local checkout exists. The helper never runs Rust, Mirai, model, network, or service commands; `runtime_verified` remains false.
2. Prefer the published `mirai` path on Apple Silicon macOS when it is already available and the user has a confirmed model. Otherwise use the source path only with `cargo` and `rustc` present, a checkout at the reviewed commit, and explicit approval for any build or download side effects.
3. Read [references/upstream.md](references/upstream.md) for the pinned command, benchmark, target, model/license, and resource matrices before performing that branch. It is the source of truth for exact commands and citations.
4. Keep source and model actions separate. `cargo tools setup` can install rustup, uv, pnpm, targets, and Metal tooling; never invoke it as a probe. A first `mirai` or source-CLI run may download a checkpoint; obtain consent first and review disk/RAM or unified-memory capacity.
5. Keep serving loopback-bound (`127.0.0.1`) by default. Check `/v1/models` before one chat-completions request. Expose another interface only with an explicit secured target and controls.
6. State platform uncertainty plainly: Apple Silicon macOS is the primary Metal path; Intel macOS, Linux, Windows, WASM, and other non-Apple source targets are CPU-oriented and/or marked in progress. Do not claim CUDA, Linux-GPU acceleration, or production readiness from this preflight.
7. Treat Uzu's custom model format as a hard boundary. A model card's license applies to its weights; Uzu's MIT source license does not relicense them, and arbitrary GGUF compatibility is not implied.

## Examples

- **"Can Uzu run on this Mac?"** Run the helper, report OS/architecture plus separate `mirai` and source `cargo`/`rustc` availability, and label Metal/runtime activation as unverified. Do not install anything.
- **"Serve my already-downloaded model from a pinned checkout."** Preflight with `--repo` and `--expect-commit`, then follow the source server command in the reference, keeping localhost and recording model/host/commit metadata.
- **"Benchmark two models."** Use the reference `bench` command with a fixed task file and local paths; report measured host-specific results only, never catalog-page numbers as reproduced evidence.
- **"Document Uzu CUDA/GGUF/LM Studio support."** Reject the unsupported premise and route the named product or conversion workflow elsewhere.

## Best practices

- Keep the preflight result distinct from runtime proof: `ok` means offline checks passed, not that a model loaded, Metal accelerated, or a service answered.
- Pin the exact Uzu commit and resolve the model repository/card, `LICENSE`, and base-model license before downloading or redistributing weights.
- Record model identifier, revision/quantization, host, Uzu commit, task file, generation settings, and output path for every run.
- Use one loaded model/session at a time when memory is constrained; report approximate sizes as budgeting hints and re-check current card metadata.
- Troubleshoot in order: checkout/commit and tool availability, target/backend, model identifier/format, then loopback endpoint. Do not switch inference engines to hide a Uzu limitation.

## References

- [Pinned operational reference](references/upstream.md) — commands, endpoint shape, benchmark metadata, platform matrix, model/license matrix, and source citations.
- Pinned repository README: https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/README.md
- Pinned platform matrix: https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/.config/platforms.toml
- Mirai docs chat quickstart: https://docs.trymirai.com/quick-start/chat.md
