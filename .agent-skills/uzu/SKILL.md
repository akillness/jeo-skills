---
name: uzu
description: >
  Operate trymirai/uzu, Mirai's Rust native local-inference engine, on supported Apple
  Silicon or CPU targets. Use when a user needs to install/build uzu, run the `mirai`
  CLI or Rust CLI, download and serve a supported model, call its OpenAI-compatible
  HTTP API, run a benchmark, or assess model-license/resource/platform constraints.
  Do not use for llama.cpp or LM Studio operation, arbitrary model conversion, or
  claims that uzu runs on unsupported targets. For those separate products, consult
  their upstream documentation rather than routing this skill to an unlisted catalog entry.
allowed-tools: Bash Read
compatibility: Requires a Rust 1.98+ toolchain for the pinned source build; Metal is available on Apple Silicon macOS/iOS targets and CPU backends are used elsewhere in the source target matrix.
metadata:
  version: "0.1"
  source: https://github.com/trymirai/uzu
  upstream_commit: d76d468a1898cacc9c4920accf8f5ff099967107
---

# Uzu operator

## When to use this skill

Use this skill for repository-grounded setup and operation of **trymirai/uzu**. It covers
source builds, the published macOS `mirai` CLI, model downloads, local chat, HTTP serving,
and the repository's benchmark command. Uzu is MIT-licensed, but downloaded checkpoints
have their own licenses; inspect the exact model card and base-model license before use or
redistribution.

Do not silently substitute another local engine or a cloud API. For separate llama.cpp,
MLX, or LM Studio workflows, use their upstream documentation. Do not promise CUDA,
Linux-GPU, Windows, WASM, or Intel-Mac support: the pinned source labels non-Apple targets
and several cross-platform targets as “in progress”, and its target matrix selects CPU there.
## Instructions


### Prerequisites and platform gate

1. Confirm the host before installing anything:
   ```sh
   uname -m
   sw_vers 2>/dev/null || true
   rustc --version
   cargo --version
   ```
   The primary supported runtime is Apple Silicon (`aarch64-apple-darwin`) with the Metal
   backend. The source target matrix also declares CPU targets for Intel macOS, Linux, and
   Windows, but marks non-Apple targets as in progress; treat them as build experiments, not
   a production-support promise. iOS, iOS Simulator, and Mac Catalyst are source targets,
   not the macOS CLI runtime.
2. For a source checkout, pin the reviewed revision rather than floating `main`:
   ```sh
   git clone https://github.com/trymirai/uzu.git
   cd uzu
   git checkout d76d468a1898cacc9c4920accf8f5ff099967107
   ```
3. The workspace declares Rust `1.98` and edition 2024. On a fresh checkout, run the
   repository bootstrap only after reviewing its effects:
   ```sh
   cargo tools setup
   ```
   This may install rustup, uv, pnpm, Rust targets, and the Metal toolchain. It changes the
   machine and may download dependencies; obtain approval when that is not already allowed.
   For a narrower Rust build, the repository documents:
   ```sh
   cargo tools build rust --targets apple
   ```

### Lowest-friction macOS install

On Apple Silicon macOS, the model cards document the Homebrew package path:

```sh
brew install mirai
mirai --model trymirai/Qwen3.5-0.8B-M
```

Replace the model identifier only with one confirmed by the current Mirai model catalog or
Hugging Face model card. The first run downloads the checkpoint. Treat download size, disk
space, RAM/unified-memory pressure, bandwidth, and provider/model terms as explicit costs;
do not start a download merely to probe availability.

### Source CLI: chat and server

From the pinned checkout, the README's CLI uses the workspace package `cli`:

```sh
cargo run --release -p cli -- --model trymirai/Qwen3.5-4B-M
```

A not-yet-downloaded model is fetched automatically. To start the OpenAI-compatible server:

```sh
cargo run --release -p cli -- server --model trymirai/Qwen3.5-4B-M
```

The default bind is `127.0.0.1:8000`. Expose another interface only deliberately:

```sh
cargo run --release -p cli -- server \
  --model trymirai/Qwen3.5-4B-M --host 0.0.0.0 --port 8080
```

The pinned README documents `GET /v1/models` and `POST /v1/chat/completions` (also at the
root paths). A minimal streaming smoke request is:

```sh
curl http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"trymirai/Qwen3.5-4B-M","messages":[{"role":"user","content":"Hello!"}],"stream":true}'
```

The documented request parameters include `temperature`, `top_p`, `top_k`, and `max_tokens`.
Keep the server bound to localhost unless remote access is an explicit, secured requirement.

### Benchmarking

Run the repository command against a **downloaded model path**, benchmark task file, and
output path:

```sh
cargo run --release -p cli -- bench MODEL_PATH TASK_PATH OUTPUT_PATH
```

The command measures the supplied task/model on the current machine; it does not justify a
cross-machine throughput claim. Record host, uzu commit, model revision/quantization,
task file, generation settings, and output path. Do not copy benchmark numbers from Mirai's
model pages into a local result: those pages identify their own hardware and date.

### Model, license, and resource checks

Before downloading or shipping a checkpoint:

1. Resolve the exact repository ID and read its Hugging Face card, `LICENSE`, and base-model
   card. Mirai quantizations inherit obligations from the base model; “uzu MIT” does not
   relicense model weights.
2. Keep the model's quantization and size in the run record. Examples from the reviewed
   catalog include Qwen3.5-0.8B-M (about 460 MB), LFM2.5-1.2B-Instruct-M (about 639 MB),
   and Muse-Glimmer-30B-M (about 16.6 GB); verify current metadata before budgeting storage.
3. Check available unified memory/disk before starting a large download or loading a second
   model. The source examples warn that each model can consume significant RAM and recommend
   keeping one loaded session at a time; iOS apps may need Apple's Increased Memory Capability
   entitlement.

Reviewed license evidence:

- Uzu source: MIT, pinned `LICENSE` at
  `https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/LICENSE`.
- Qwen3.5-0.8B-M: Apache-2.0 in the Mirai card; base license linked from that card.
- Muse-Glimmer-30B-M: Apache-2.0 in the Mirai card; base license linked from that card.
- LFM2.5-1.2B-Instruct-M: `other`, specifically `lfm-open-license`; follow the card's
  license link to LiquidAI and do not summarize it as Apache/MIT.
## Best practices


### Troubleshooting boundaries

- Model not found: verify the repository ID, branch/revision, and whether the model belongs
  to uzu's own format/catalog. Uzu uses a custom model format; arbitrary GGUF is not implied.
- Slow or failing build: verify Rust version, target triple, deployment target, and whether
  Metal tooling is present. Do not “fix” this by switching to another inference engine.
- HTTP failure: check that the process is listening on the selected host/port and use the
  documented `/v1/models` endpoint before sending chat requests.
- Unsupported host: report the source matrix and backend honestly; do not claim CUDA,
  Windows/Linux GPU acceleration, or a tested Intel/Linux/Windows production path without
  fresh upstream evidence.

## Examples

- “Run Qwen locally on an M-series Mac”: use the Homebrew `mirai` path, show the exact model
  card/license, ask before the first download, then smoke-test one local reply.
- “Expose uzu to my app”: use `server`, retain localhost by default, test `/v1/models`, then
  send one `chat/completions` request; only bind externally with explicit security controls.
- “Compare speed”: use `bench` with a fixed task file and report measured local results with
  hardware and model metadata; never present catalog-page figures as reproduced evidence.

## References

- Pinned repository README: `https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/README.md`
- Pinned platform matrix: `https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/.config/platforms.toml`
- Mirai docs chat quickstart: `https://docs.trymirai.com/quick-start/chat.md`
- Mirai model catalog: `https://trymirai.com/local-models`
- Qwen card: `https://huggingface.co/trymirai/Qwen3.5-0.8B-M`
- LFM card: `https://huggingface.co/trymirai/LFM2.5-1.2B-Instruct-M`
- Muse card: `https://huggingface.co/trymirai/Muse-Glimmer-30B-M`
