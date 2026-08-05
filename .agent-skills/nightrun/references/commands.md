# NightRun command reference

Source of truth: `CLAUDE.md` and `README.md` in the upstream
[hardrave/NIGHTRUN](https://github.com/hardrave/NIGHTRUN) repository. This
file mirrors the commands an agent will actually run; re-check the upstream
`CLAUDE.md` if it drifts, since it is the authoritative agent-facing doc.

## Prerequisites

- Linux (the installer only targets Linux hosts and refuses to run
  destructive flashes elsewhere)
- Rust stable **and** nightly (`nr-boot` needs `-Zbuild-std`)
- QEMU (`qemu-system-x86_64`) + OVMF firmware for emulator testing
- ~6 GB free disk per model (GGUF source + converted `.nrm` + image)
- Raspberry Pi 5 target: a pinned UEFI firmware build, see
  `docs/rpi5-uefi.md` upstream

## Host-side test suite

```bash
cargo test                    # default-members exclude nr-boot
cargo test -p nr-token        # single crate
cargo test -p nr-token -- test_name   # single test
```


`nr-token` fixtures and `nr-model` parity tests skip silently when
`models/model.nrm` / `models/qwen3-4b-q4km.nrm` are absent — regenerate them
with `nrconvert` before trusting a green run.

## Model conversion (`nrconvert`)

```bash
cargo run --release -p nrconvert -- in.gguf models/model.nrm
```


Supports any GGUF whose tensors are Q8_0, Q4_K, Q6_K, or F32; each tensor's
exact dtype is preserved. Hybrid SSM/MoE Granite variants are rejected at
conversion with a named reason, not silently mangled.

## Host inference debugging (`nrhost`)

```bash
cargo run --release -p nrhost -- models/model.nrm --prompt "..." \
  [--raw] [--temp 0] [--threads 8]
```


Runs the identical inference engine on Linux — debug engine issues here
before reaching for QEMU. Use `--debug-gap` to inspect near-tie logit gaps
when chasing Granite's `/10` logit-scaling parity flips.

## Firmware / image build (`cargo xtask`)

```bash
cargo xtask build              # build BOOTX64.EFI only
cargo xtask image [--model models/qwen3-4b-q4km.nrm]   # build nightrun.img
cargo xtask run [--img] [--model <file.nrm>] [--window] \
  [--mem 4G|6G] [--smp 8] [--secs N] \
  [--shot t:file.png] [--keys "t:text\n"]
cargo xtask bench              # scripted QEMU run -> docs/benchmarks.md
```


Notes:
- `nr-boot` builds **only** through `xtask` (nightly + `-Zbuild-std` +
  `x86_64-nightrun-uefi.json`, a custom hard-float target — the builtin UEFI
  target is soft-float and breaks AVX intrinsics and f32 perf).
- Qwen runs need `--mem 6G`; other models need `--mem 4G`.
- QEMU testing of the full model path needs `--img --mem 4G` — the model
  exceeds QEMU's virtual-FAT limit, so ESP-directory dev mode only works
  without a model loaded.
- `--keys` supports `<up>/<down>/<pgup>/<pgdn>/<esc>` tokens for scripted
  interaction; `--shot t:file.png` captures a framebuffer screenshot at time
  `t`.
- Serial (COM1) is the debug channel in QEMU: `target/serial.log`.

## Real hardware flash (`install.sh`)

```bash
git clone https://github.com/hardrave/NIGHTRUN.git
cd NIGHTRUN
less install.sh      # read what you are about to run
./install.sh
```


Walks through target choice (x86_64 USB or Pi 5 SD), model selection, a
verified download (pinned revision, SHA-256), image build, and flashing.
Refuses system disks, lists only removable whole-disk devices, and demands
typing `FLASH /dev/sdX` verbatim before writing a byte. This confirmation
step must stay interactive and must never be scripted or auto-answered by an
agent.

`NIGHTRUN_INSTALL_DEBUG=1 ./install.sh` enables full bash tracing into
`installer-logs/<timestamp>/trace.log` (token-handling code paths disable
tracing locally so secrets never reach the trace).

## Tokenizer fixtures

```bash
python3 scripts/gen_tokenizer_fixtures.py
```


Regenerate `tests/fixtures/tokenizer_cases*.txt` from the official
Hugging Face tokenizers (`split_special_tokens=True`) whenever the tokenizer
or chat template changes; `nr-token/tests/fixtures.rs` hardcodes header
offsets that must stay in sync.

## Supported model families

| Family | Quant | Notes |
|---|---|---|
| Llama 3.2 (1B/3B) | Q8_0 / Q4_K_M | GQA, adjacent-pair RoPE, tied embeddings |
| Qwen3 4B Instruct 2507 | Q4_K_M | NEOX-style RoPE, per-head Q/K RMSNorm, no BOS, attention width 4096 != hidden 2560 |
| Granite 4.1 3B | Q4_K_M | Dense only (hybrid SSM/MoE rejected at conversion); four muP scalars in header |

## Hard rules (do not violate)

1. Never `cargo build --workspace` / `cargo test --workspace` — build
   `nr-boot` only via `cargo xtask`.
2. Never add `ExitBootServices()`.
3. Never call firmware services from AP worker code — `nr-tensor::parallel`
   workers are atomics + compute only.
4. Never bypass or script the `FLASH /dev/sdX` confirmation in `install.sh`.
5. Treat greedy-output parity breaks against llama.cpp as engine bugs, not
   fixture bugs.
