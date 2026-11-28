# Upstream Provenance: `alesha-pro/llm.asm`

- **Repository**: <https://github.com/alesha-pro/llm.asm>
- **Pinned Commit**: `e7d48837421da791cb9468fd518e22e0b996d1ad` (`2026-11-27`)
- **License**: `MIT`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Source build: `nasm -f elf64 -o qwen3.o qwen3.asm && ld -o qwen3 qwen3.o`
- QEMU emulation: `qemu-system-x86_64 -kernel os.bin -m 512M -serial stdio`
- Makefile targets: `make inference`, `make os`, `make train`

## Key Architecture & Concepts

- **Zero-Dependency x86-64 Assembly**: Implements AVX2+FMA+F16C GEMM, expf, sincosf, RMSNorm, RoPE, SiLU, and Softmax in pure assembly.
- **Bare-Metal Bootloader**: Minimal 22 KB OS image booting directly on x86-64 hardware without Linux or Windows host kernel.
- **Braille TUI Trainer**: Mini-GPT trainer in 32 KB assembly rendering real-time loss curves via Unicode Braille characters.

## Boundaries & Cross-Routing

- Requires x86-64 CPU with AVX2 instruction support for GEMM execution.
- Route out: Distributed GPU cluster inference -> `infrastructure-core`; High-level PyTorch models -> `architecture`.
