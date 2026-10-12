# Uzu pinned operational reference

This reference preserves the audited operations for **trymirai/uzu** at commit
`d76d468a1898cacc9c4920accf8f5ff099967107`. It is branch-loaded from the compact router; it is
not a runtime proof or a license grant.

## Reviewed source and safety boundary

- Source repository: <https://github.com/trymirai/uzu>
- Reviewed commit: `d76d468a1898cacc9c4920accf8f5ff099967107`
- Source license: MIT, from the pinned [`LICENSE`](https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/LICENSE).
- The helper's `--expect-commit` is caller-supplied and compares only a local Git `HEAD`; it is not a network verification.
- The source uses a custom Uzu model format. Do not infer arbitrary GGUF loading or conversion from the source CLI.

A source checkout is expected to be a normal Git worktree with these public files before source
commands are considered: `Cargo.toml`, `README.md`, `LICENSE`, and `.config/platforms.toml`.
Use the helper with the exact checkout path and commit:

```sh
python3 .agent-skills/uzu/scripts/preflight.py --json \
  --repo /path/to/uzu \
  --expect-commit d76d468a1898cacc9c4920accf8f5ff099967107
```

## Path selection and prerequisites

### Published `mirai` CLI

On Apple Silicon macOS, the lowest-friction documented path is:

```sh
brew install mirai
mirai --model trymirai/Qwen3.5-0.8B-M
```

`brew install` changes the machine and the first model invocation can download a checkpoint;
obtain approval before either side effect. Replace the model identifier only after checking the
current Mirai catalog/card. The helper checks whether `mirai` is discoverable but does not invoke
it or prove that a model is installed, valid, or accelerated.

### Pinned source checkout

Use a reviewed revision rather than floating `main`:

```sh
git clone https://github.com/trymirai/uzu.git
cd uzu
git checkout d76d468a1898cacc9c4920accf8f5ff099967107
```

The workspace declares Rust `1.98` and edition 2024. The documented bootstrap is potentially
machine-changing and networked:

```sh
cargo tools setup
```

It may install rustup, uv, pnpm, Rust targets, and Metal tooling. Do not run it as a probe or
without approval. A narrower documented Rust build is:

```sh
cargo tools build rust --targets apple
```

The helper checks `cargo` and `rustc` availability with `shutil.which`; it never executes a Rust
shim or starts a build.

## Source CLI and HTTP operations

From the pinned checkout, the README uses workspace package `cli`:

```sh
cargo run --release -p cli -- --model trymirai/Qwen3.5-4B-M
cargo run --release -p cli -- server --model trymirai/Qwen3.5-4B-M
```

A missing model may be fetched automatically. Review model identity, license, storage, and memory
before starting. The documented default server bind is `127.0.0.1:8000`; keep it local by default.
The explicit external-bind example is a deliberate exception and needs separate network/security
controls:

```sh
cargo run --release -p cli -- server \
  --model trymirai/Qwen3.5-4B-M --host 0.0.0.0 --port 8080
```

The pinned README documents `GET /v1/models` and `POST /v1/chat/completions` (also at root paths).
After the process is deliberately started, check the model list before a minimal streaming request:

```sh
curl http://127.0.0.1:8000/v1/models
curl http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"trymirai/Qwen3.5-4B-M","messages":[{"role":"user","content":"Hello!"}],"stream":true}'
```

Documented request controls include `temperature`, `top_p`, `top_k`, and `max_tokens`. Do not
turn endpoint success into a cross-host acceleration claim.

## Benchmark operation

Run the repository command against a **downloaded model path**, benchmark task file, and output
path only after model/license and resource gates pass:

```sh
cargo run --release -p cli -- bench MODEL_PATH TASK_PATH OUTPUT_PATH
```

A benchmark measures the supplied task/model on the current machine. It does not justify a
cross-machine throughput claim. Record all of:

- host OS, architecture, and backend state;
- Uzu commit;
- model repository/revision and quantization;
- task file and generation settings;
- output path and date.

Do not copy benchmark figures from Mirai model pages into a local result; those pages identify
their own hardware and date.

## Platform and backend matrix

The pinned source matrix is [`.config/platforms.toml`](https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/.config/platforms.toml). Keep these distinctions:

| Host/target | Backend or status | Operator meaning |
| --- | --- | --- |
| Apple Silicon macOS (`aarch64-apple-darwin`) | Metal primary path | Supported product path when the actual runtime is separately verified. |
| Intel macOS | CPU-oriented source target; in progress | Build experiment, not a production-support promise. |
| iOS, iOS Simulator, Mac Catalyst | Apple-platform source targets; Metal where the platform supports it | Not the macOS `mirai` CLI runtime; entitlement/app integration is separate. |
| Linux and Windows source targets | CPU-oriented; non-Apple/in progress | Do not claim production readiness or GPU acceleration from the matrix. |
| WASM and other cross-platform targets | In progress / target-specific | Treat as source experiments only unless fresh evidence proves otherwise. |
| CUDA or Linux GPU | No guarantee in this skill | Never infer support from a CPU target or a successful preflight. |

Metal is the primary Apple Silicon path. CPU elsewhere is a target selection, not evidence that
an optimized runtime is available. The offline helper reports host and tool availability only;
`runtime_verified` is always `false`.

## Model, license, and resource matrix

Weights have separate terms from the Uzu source. Resolve the exact model repository and read its
Hugging Face card, `LICENSE`, and base-model card before downloading or redistributing:

| Mirai model example | Approximate artifact size in reviewed material | Card/license signal | Required handling |
| --- | ---: | --- | --- |
| `trymirai/Qwen3.5-0.8B-M` | about 460 MB | Apache-2.0; follow linked base-model license | Re-check current card and quantization before budgeting. |
| `trymirai/LFM2.5-1.2B-Instruct-M` | about 639 MB | `other`, specifically `lfm-open-license` | Follow LiquidAI's linked terms; do not summarize as Apache/MIT. |
| `trymirai/Muse-Glimmer-30B-M` | about 16.6 GB | Apache-2.0; follow linked base-model license | Treat disk/RAM or unified-memory pressure as a hard gate. |

Catalog and cards:

- Mirai local-model catalog: <https://trymirai.com/local-models>
- Qwen card: <https://huggingface.co/trymirai/Qwen3.5-0.8B-M>
- LFM card: <https://huggingface.co/trymirai/LFM2.5-1.2B-Instruct-M>
- Muse card: <https://huggingface.co/trymirai/Muse-Glimmer-30B-M>

The sizes above are budgeting hints from the reviewed material, not current guarantees. Check
available disk and unified memory before a large download or loading a second model. The source
examples warn that each model may consume significant RAM and recommend one loaded session at a
time; iOS apps may require Apple's Increased Memory Capability entitlement.

## Troubleshooting boundaries

- **Model not found:** verify repository ID, branch/revision, and Uzu's model format/catalog; do not silently substitute GGUF or another engine.
- **Slow/failing build:** inspect Rust version, target triple, deployment target, and Metal tooling; do not invoke setup shims merely to probe.
- **HTTP failure:** confirm the deliberate process is listening on the selected host/port, then check `/v1/models` before chat.
- **Unsupported host:** report the matrix and CPU/in-progress status honestly; do not claim CUDA, Linux/Windows GPU, Intel production, or WASM support without fresh evidence.

## Cited upstream documents

- Pinned README: <https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/README.md>
- Pinned platform matrix: <https://github.com/trymirai/uzu/blob/d76d468a1898cacc9c4920accf8f5ff099967107/.config/platforms.toml>
- Mirai chat quickstart: <https://docs.trymirai.com/quick-start/chat.md>
- Mirai model catalog: <https://trymirai.com/local-models>
