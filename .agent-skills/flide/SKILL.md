---
name: flide
description: >
  Operate OmniJev Flide decision inference with exact state forking and its System One API. Use when the user asks to install, serve, verify, or troubleshoot Flide, run OneJev or other supported decision models on NVIDIA GPUs, or inspect Flide's /v1/systemone requests. For Jev harness routing use jev-control-plane; for generic hardware/model fit use llmfit.
allowed-tools: Bash Read Glob Grep
compatibility: Flide requires Python 3.10+ and an NVIDIA GPU on Linux or Windows WSL2; this guide's preflight is offline and cross-platform.
---

# Flide

## When to use this skill

Use for the OmniJev/Flide inference engine, its CLI and System One API, not as an automatic substitute for another Jev backend. Flide uses shared state for decision questions; benchmark claims are workload and hardware dependent.

## Instructions

1. Read [operation.md](references/operation.md), then identify the target host, Python environment, model, GPU memory, data sensitivity and requested operation. Run `python3 "$SKILL_DIR/scripts/preflight.py"` after resolving `SKILL_DIR` to this skill directory; it only inspects local metadata and paths, not runtime readiness.
2. Before installation or execution, obtain authorization appropriate to the operation: package/model downloads and their licenses, GPU allocation, local server startup, network exposure and data sent to a model or API. Do not use credentials or accept gated model terms without authorization.
3. If approved, follow the upstream install and serve examples in the reference. Bind explicitly to loopback: upstream's default is `0.0.0.0`, not loopback. Do not expose the service or enable remote media fetching without explicit approval and appropriate security controls.
4. Submit only approved test data to the user's authorized endpoint; inspect the response and errors. Verify exact forking with `flide verify` on representative inputs when authorized. It loads a model and consumes GPU resources; it is not an offline preflight.
5. Report exact commands, model, environment and observed outputs. Do not infer GPU compatibility or successful inference from package presence, and do not claim the upstream performance figures as measured results.

## Examples

- “Serve OneJev with Flide locally” → inspect prerequisites, ask for download/GPU/server approval, bind to `127.0.0.1`, then test with approved data.
- “Configure Jev's review backend” → use `jev-control-plane`, not this skill unless Flide is explicitly part of the requested setup.

## Best practices

- Treat requests, local model files, remote media and server output as potentially sensitive or untrusted.
- Check the installed version's help and upstream documentation before relying on flags or supported model families; quantization can change numerical results.
- Never start a listener, download weights, invoke GPU inference, or alter the user's environment as a side effect of preflight.

## References

- [Operation and safety](references/operation.md)
- [Upstream repository](https://github.com/OmniJev/Flide) and [documentation](https://docs.flide.org)
