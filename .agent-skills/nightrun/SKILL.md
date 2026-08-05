---
name: nightrun
description: >
  Build, test, run, and flash NightRun — a bare-metal, no_std Rust UEFI
  application that boots straight into a local LLM (Llama 3.2, Qwen3, or
  Granite 4.1) with no operating system underneath. Use when the user wants
  to build/flash a bootable NightRun USB or Raspberry Pi 5 SD image, convert
  a GGUF model into the `.nrm` container, run/debug the inference engine on
  the host or in QEMU/OVMF, or troubleshoot no_std kernel/tokenizer parity
  issues in the NightRun codebase. Triggers on: "nightrun", "boot into an
  LLM", "bare-metal LLM runtime", "UEFI LLM appliance", "nrconvert", "nrhost",
  "cargo xtask", "nrm model file", "flash a bootable LLM USB".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Linux host required for building/flashing (installer refuses non-removable
  disks). Needs Rust (stable + nightly), QEMU/OVMF for emulator testing, and
  ~6 GB free disk per model. Raspberry Pi 5 target additionally needs a
  pinned UEFI firmware build. Pairs with `harness`/`build-fix` for general
  Rust workspace debugging.
metadata:
  tags: nightrun, rust, no_std, uefi, bare-metal, local-llm, llama-cpp-parity, gguf, qemu, raspberry-pi
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: hardrave/NIGHTRUN
---

# NightRun

NightRun is a single `no_std` Rust UEFI application that boots directly into a
chat prompt for a quantized local LLM (Llama 3.2, Qwen3, or dense Granite
4.1) — no Linux, no kernel, no browser, no network stack. The model is
streamed into RAM with inline CRC-32 verification, storage is sealed once
loaded, and inference runs entirely on-CPU (AVX2+FMA+F16C on x86_64, NEON on
Pi 5). This skill drives the build → convert → test → flash workflow safely.

## When to use this skill

- Building `BOOTX64.EFI` or a full bootable `nightrun.img` from source
- Converting a GGUF checkpoint into the `.nrm` container with `nrconvert`
- Running/debugging the inference engine on the host (`nrhost`) before
  reaching for QEMU
- Booting NightRun in QEMU/OVMF (`cargo xtask run`) for screenshots or
  scripted verification
- Flashing a real USB stick or Raspberry Pi 5 SD card via `install.sh`
- Diagnosing tokenizer/parity failures against llama.cpp reference fixtures

## When not to use this skill

- General local-LLM serving without bare-metal/no-OS constraints → use a
  normal inference runtime, not this skill
- Generic Rust workspace refactors unrelated to the boot/model/kernel path →
  use `harness` or `build-fix`
- Cross-compiling for targets other than x86_64 UEFI / Raspberry Pi 5 → out
  of scope; NightRun is UEFI-only, no legacy BIOS

## Instructions

### Step 1: Clone and read the workspace rules first

```bash
git clone https://github.com/hardrave/NIGHTRUN.git
cd NIGHTRUN
```

Read `CLAUDE.md` before touching `crates/nr-boot`. Two hard rules:

- Never run `cargo build --workspace` / `cargo test --workspace` — `nr-boot`
  only builds through `cargo xtask` (nightly + `-Zbuild-std` + the custom
  hard-float target `x86_64-nightrun-uefi.json`); its panic handler collides
  with the host std target.
- Never add `ExitBootServices()` and never call firmware services from AP
  worker code (`nr-tensor::parallel` workers are atomics + compute only).

### Step 2: Pick the smallest working mode

Use `references/commands.md` for the full command reference. Pick one:

1. **Host-side engine work** (kernels, tokenizer, sampling) → `cargo test`,
   `cargo run --release -p nrhost`
2. **Model conversion** → `cargo run --release -p nrconvert`
3. **Firmware build only** → `cargo xtask build`
4. **Full image + QEMU verification** → `cargo xtask image` then
   `cargo xtask run`
5. **Real hardware flash** → `./install.sh` (interactive, confirmation-gated)

Do not jump straight to flashing real media before a green QEMU boot.

### Step 3: Convert a model before any boot attempt

```bash
cargo run --release -p nrconvert -- path/to/model.gguf models/model.nrm
```

The converter re-parses and re-checksums its own output before declaring
success. Qwen needs 6 GB QEMU RAM (`--mem 6G`); other models need 4 GB.

### Step 4: Verify on host, then in QEMU, before flashing hardware

```bash
cargo run --release -p nrhost -- models/model.nrm --prompt "..." --temp 0
cargo xtask image --model models/model.nrm
cargo xtask run --img --model models/model.nrm --mem 4G --smp 8 \
  --shot 5:boot.png
```

Only escalate to `./install.sh` (flashes a real USB/SD device) after the
QEMU boot and chat response look correct. The installer refuses non-removable
disks and requires typing `FLASH /dev/sdX` verbatim — never script around
that confirmation.

### Step 5: Use the wrapper for a guided, non-destructive dry run

```bash
bash .agent-skills/nightrun/scripts/nightrun.sh doctor /path/to/NIGHTRUN
bash .agent-skills/nightrun/scripts/nightrun.sh build /path/to/NIGHTRUN
bash .agent-skills/nightrun/scripts/nightrun.sh convert /path/to/NIGHTRUN in.gguf models/model.nrm
bash .agent-skills/nightrun/scripts/nightrun.sh qemu /path/to/NIGHTRUN models/model.nrm
```

`doctor` only reports prerequisite status (Rust toolchains, QEMU, disk
space); it never writes to disk. Flashing real media stays a manual,
interactive `./install.sh` run — the wrapper deliberately does not automate
it.

### Step 6: Debug parity failures with the reference fixtures

Greedy output is pinned token-for-token against llama.cpp for every model
family (`crates/nr-model/tests/parity.rs`). If a kernel/rope/rmsnorm change
breaks parity, the kernel is wrong, not the fixture. Regenerate tokenizer
fixtures with `scripts/gen_tokenizer_fixtures.py` when the tokenizer or chat
template changes.

## Best practices

1. **Never bypass the flash confirmation** — `install.sh` demands an exact
   typed `FLASH /dev/sdX`; do not script that input.
2. **QEMU before hardware, always** — a red QEMU boot means real media isn't
   ready either.
3. **Treat parity breaks as engine bugs** — the llama.cpp fixtures are the
   source of truth, not the new kernel.
4. **Keep `nr-boot` on the xtask path** — nightly + `-Zbuild-std` + the
   custom hard-float target, never plain `cargo build --workspace`.
5. **Regenerate models after tokenizer/format changes** — stale `.nrm` files
   make test failures look like regressions when they're just stale fixtures.

## References

- Upstream repo: [hardrave/NIGHTRUN](https://github.com/hardrave/NIGHTRUN)
- Full command reference: `references/commands.md`
- Wrapper script: `scripts/nightrun.sh`
- Project standards: `.agent-skills/skill-standardization/SKILL.md`


## Examples

### Example 1: Prototype a new model without touching real hardware

```bash
bash .agent-skills/nightrun/scripts/nightrun.sh doctor ~/src/NIGHTRUN
cargo run --release -p nrconvert -- ~/models/llama-3.2-1b-q8_0.gguf ~/src/NIGHTRUN/models/model.nrm
cargo run --release -p nrhost -- ~/src/NIGHTRUN/models/model.nrm --prompt "hello" --temp 0
```


### Example 2: Full QEMU verification before flashing a USB stick

```bash
bash .agent-skills/nightrun/scripts/nightrun.sh qemu ~/src/NIGHTRUN models/model.nrm --shot 5:boot.png
# only after a correct boot + chat response:
cd ~/src/NIGHTRUN && ./install.sh
```

