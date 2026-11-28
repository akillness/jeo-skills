---
name: llm-asm
description: >
  Inspect, assemble, and run alesha-pro/llm.asm, a pure x86-64 NASM assembly implementation of Qwen3-0.6B inference (12 KB), bare-metal bootable OS (22 KB), and Mini-GPT trainer with live Braille TUI (32 KB) with zero C and zero libc runtime dependencies. Use when studying minimal AVX2/FMA/F16C GEMM/GEMV matrix kernels, low-level transformer arithmetic (expf, sincosf, RMSNorm, RoPE, SiLU, Softmax), bare-metal OS boot routines with QEMU, or building zero-dependency assembly binaries. Do not use for high-throughput CUDA/ROCm cluster inference (route to vllm) or PyTorch model training (route to architecture). Triggers on: llm.asm, nasm llm, baremetal os llm, qwen3 assembly, zero libc inference, alesha-pro/llm.asm.
allowed-tools: Read Glob Grep Bash
compatibility: x86-64 Linux/QEMU, nasm 2.15+, GNU ld, optional make. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/alesha-pro/llm.asm
  upstream_commit: e7d48837421da791cb9468fd518e22e0b996d1ad
  pinned_at: "2026-11-27"
---
# LLM.asm (`alesha-pro/llm.asm`)

Source-pinned operator guide for `alesha-pro/llm.asm` (MIT), providing verified instructions and offline preflight validation.

## When to use this skill

- Assemble and inspect 100% pure x86-64 NASM Qwen3-0.6B inference, bare-metal OS, and Mini-GPT trainer with zero libc.
- For complete trigger patterns: llm-asm, nasm, assembly, qwen3, bare-metal, avx2, zero-dependency.
- Cross-routing boundaries: route out to `architecture`, `compilers`, `system-environment-setup` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Source build: `nasm -f elf64 -o qwen3.o qwen3.asm && ld -o qwen3 qwen3.o`
   - QEMU emulation: `qemu-system-x86_64 -kernel os.bin -m 512M -serial stdio`
   - Makefile targets: `make inference`, `make os`, `make train`

3. **Execute verified workflows & operations**:
   - **Zero-Dependency x86-64 Assembly**: Implements AVX2+FMA+F16C GEMM, expf, sincosf, RMSNorm, RoPE, SiLU, and Softmax in pure assembly.
   - **Bare-Metal Bootloader**: Minimal 22 KB OS image booting directly on x86-64 hardware without Linux or Windows host kernel.
   - **Braille TUI Trainer**: Mini-GPT trainer in 32 KB assembly rendering real-time loss curves via Unicode Braille characters.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Requires x86-64 CPU with AVX2 instruction support for GEMM execution.
   - Route out: Distributed GPU cluster inference -> `infrastructure-core`; High-level PyTorch models -> `architecture`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
