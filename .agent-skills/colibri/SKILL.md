---
name: colibri
description: >
  Assist with Colibri: pure-C LLM inference engine for running GLM-5.2 (744B MoE)
  on consumer machines with ~25 GB RAM. Use when setting up, building, converting models,
  running inference, configuring expert streaming and caching, optimizing speculative 
  decoding (MTP), GPU integration, and integrating Colibri into production pipelines.
  Includes build setup, model download & conversion, chat/inference modes, performance tuning,
  and API integration patterns.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works with Colibri (main branch). Useful for AI engineers, ML researchers, and developers
  needing efficient LLM inference on consumer hardware or edge devices. Pairs well with
  model quantization, local inference infrastructure, and LLM application development skills.
metadata:
  tags: colibri, llm-inference, glm-5.2, moe, speculative-decoding, quantization, expert-streaming, consumer-hardware, c-runtime
  platforms: Claude, ChatGPT, Gemini, Codex, jeopi
  version: "1.0"
  source: JustVugg/colibri
---

# Colibri

Assist with Colibri — the pure-C inference engine for running GLM-5.2 (744B Mixture-of-Experts) on consumer machines with ~25 GB RAM, featuring expert disk-streaming, MLA attention, and native speculative decoding (MTP).

## When to use this skill

- **Setup & build**: Installing C build tools, running `setup.sh`, configuring OpenMP, cross-platform compilation (Linux, macOS, Windows via WSL)
- **Model download & conversion**: Running `coli convert` to fetch GLM-5.2-FP8 shards, convert to int4 container, prepare MTP heads (int8 quantization)
- **Inference modes**: Running chat mode (`coli chat`), API server setup, batch inference, configuring sampling and temperature
- **Expert caching & storage**: Tuning LRU cache sizes, pin-hot-store configuration, disk I/O optimization, thermal management
- **Speculative decoding (MTP)**: Enabling/disabling multi-token prediction, measuring draft acceptance rates, optimizing verification latency
- **GPU acceleration**: Configuring CUDA pinned experts, GPU vRAM budgeting, hybrid CPU-GPU inference
- **Performance profiling**: Measuring tokens/second, analyzing expert-load patterns, memory residency tuning
- **Integration & deployment**: Embedding Colibri in applications, wrapping inference API, local-first LLM pipelines

## When not to use this skill

- **Python-first LLM frameworks**: Use `llama-index`, `crewai-multi-agent`, or `pydantic-ai` for high-level abstractions
- **Distributed/cloud inference**: Use cloud LLM APIs or `deepspeed` for multi-GPU/multi-node training
- **LLM fine-tuning**: Use `dspy`, `openrlhf-training`, or `moe-training` for training workflows
- **General AI infra**: Use `system-environment-setup` for unrelated dev environments

## Core architecture

**Main components:**

1. **glm.c** (~2,400 lines) — Faithful GLM-5.2 (glm_moe_dsa) forward pass with MLA attention, MTP speculative decoding, DeepSeek-V3 sigmoid router
2. **Expert streaming** — 21,504 routed experts (75 MoE layers × 256 experts) live on disk (~370 GB total at int4), streamed on demand with per-layer LRU cache
3. **Storage hierarchy** — Dense layers (attention, shared experts, embeddings) in RAM (~9.9 GB at int4), experts on NVMe/HDD, OS page cache as L2
4. **MTP speculative decoding** — GLM-5.2's native multi-token-prediction head (layer 78, int8 for lossless 39–59% draft acceptance) drafts and main model verifies in one forward
5. **MLA attention** — q/kv-LoRA + interleaved partial RoPE with compressed KV-cache (576 floats/token vs 32,768 dense — 57× smaller)

**CLI modes:**

- `coli chat` — Interactive chat with streaming, auto-detected RAM/cache/MTP
- `coli convert` — Download GLM-5.2-FP8, quantize to int4, prepare MTP int8 head
- `coli plan` — Inspect storage hierarchy, vRAM budget, expert placement before loading

## Key parameters

| Parameter | Scope | Default | Notes |
|-----------|-------|---------|-------|
| `COLI_MODEL` | env | (required) | Path to converted int4 model directory |
| `--ram <GB>` | plan/chat | auto-detect | RAM budget for dense layers (min 10 GB) |
| `--vram <GB>` | plan/chat | 0 (CPU-only) | GPU vRAM for pinned experts (requires CUDA build) |
| `--cache <MB>` | plan/chat | auto-detect | Per-layer LRU cache size for routed experts |
| `--mtp on/off` | chat | auto-detect | Enable/disable speculative decoding (off = single-token mode) |
| `--temperature <0–2>` | chat | 0.95 | Sampling temperature (0 = greedy) |
| `--top-p <0–1>` | chat | 0.9 | Nucleus sampling threshold |

## Performance metrics (community benchmarks)

- **Tokens/second (CPU, int4 cache warm)**:
  - Single token: ~1.2 tok/s (minimal cache misses)
  - MTP enabled: ~2.2–2.8 tok/s (2.2–2.8× speedup, 39–59% draft acceptance)
  - MTP with cold cache: may regress due to extra expert loads (~660 → ~1100/token)
- **Residency**: Dense layers ~9.9 GB RAM; experts 370 GB disk
- **Memory overhead**: ~11 GB per-token token from routed experts; 57× smaller KV-cache than dense attention
- **Conversion time**: ~30–60 min (one-time, depends on disk speed and internet)

## Integration patterns

- **Local chat UI**: Wrap `coli chat` in a terminal/web interface
- **API server**: Stream inference output over HTTP/gRPC
- **Batch processing**: Run multiple prompts with persistent model load
- **Hybrid CPU-GPU**: Pin hot experts to GPU vRAM, stream others from disk
- **Edge/mobile**: int4 model size (~370 GB) requires local NVMe; consider pruning/distillation for smaller devices
