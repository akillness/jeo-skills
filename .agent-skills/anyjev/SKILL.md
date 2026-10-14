---
name: anyjev
description: >
  Operate nokia-applied-research/AnyJev, the Apache-2.0 Python library for
  training-free typed choice, yes/no, and score decisions from next-token
  probabilities. Use when pinning or inspecting a checkout, selecting raw/L0
  Decider readouts, running approved Tacit checkpoints, configuring HF/vLLM/
  SGLang/llama.cpp backends, checking tokenizer or calibration limits, or using
  the local gateway. Triggers on AnyJev, Tacit, L0, permutation debiasing,
  llama.cpp logprob, SGLang /generate, or comparisons with hosted TypeSafe
  AI/Jev. Do not use for TypeSafe hosted services or a generic Jev harness.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python >=3.10. Model weights and datasets are opt-in downloads. HF/transformers,
  vLLM, SGLang, and llama.cpp have separate runtime and hardware requirements;
  remote servers and model providers may require credentials or incur compute cost.
license: Apache-2.0
metadata:
  version: "1.1.0"
  source: https://github.com/nokia-applied-research/AnyJev
  upstream_commit: d458d13968eec0e2cfa8c81b64629b96cf5cb4a9
---

# AnyJev operator

This skill targets the pinned AnyJev checkout at commit
`d458d13968eec0e2cfa8c81b64629b96cf5cb4a9` (package `0.3.0`, audited
2026-10-07). Detailed commands, limits, backend contracts, and citations live
in [`references/upstream.md`](references/upstream.md).

## When to use this skill

- Inspect or pin an AnyJev checkout without downloading weights or datasets.
- Build a training-free `Decider` readout and distinguish `raw` from `L0`.
- Run an approved Tacit checkpoint with transformers, vLLM, or a vLLM server.
- Configure HF, vLLM, SGLang, or GGUF/llama.cpp backends and tokenizer rules.
- Evaluate adaptive rotation calibration or the local `anyjev.serve` gateway.
- Record a bounded research readout with model, backend, and source evidence.

Use external TypeSafe AI documentation or its own skill for hosted System
One/Jev APIs, credentials, billing, or a separate Jev harness. AnyJev is an
independent self-hosted open-model library; its manifest has no `typesafe-ai`
dependency.

## Instructions

### 1. Choose one route

Select exactly one route before changing anything: `inspect`, `decider`,
`tacit`, `backend`, `gateway`, or `research`. Read the corresponding pinned
details in `references/upstream.md`; do not infer newer `main` behavior.

### 2. Run the offline preflight first

From the repository root:

```bash
python3 .agent-skills/anyjev/scripts/preflight.py --json
```

From an installed skills root:

```bash
python3 "$SKILLS_ROOT/anyjev/scripts/preflight.py" --json
```

Add `--repo PATH --expect-commit d458d13968eec0e2cfa8c81b64629b96cf5cb4a9`
to inspect a literal local checkout path. The helper only reads Python and
distribution metadata, host/tool presence, public checkout shape, and a local
Git commit. `runtime_verified=false` is always honest: detected packages are
not working inference, activated servers, loaded models, or quality evidence.
Optional backend extras may be absent; base AnyJev still requires Python
`>=3.10`, AnyJev metadata, and NumPy `>=1.24`.

### 3. Execute the approved route

Install only the selected optional extra and make model, dataset, server, and
credential side effects explicit. Preserve the `Question` option/level
contracts, require `L0` when it is part of the acceptance condition, and never
describe Tacit's one-forward output as an L0-averaged result. For HTTP
backends, verify tokenizer availability and required log-probability settings;
keep the gateway loopback-bound unless external authentication and network
policy are in place.

### 4. Verify and report

For no-download API plumbing, the pinned `FakeBackend` smoke path is allowed
but is fixture evidence, not model-quality evidence. For real inference report
the AnyJev commit, model revision, backend/engine, tokenizer, dtype/device,
question layout, prior/adaptive settings, and dataset license. Report package
metadata and PATH detections separately from successful inference.

## Examples

- **Inspect only:** run the offline preflight with `--repo` and the pinned
  `--expect-commit`; then read the pinned metadata and limitations.
- **Decider:** use a causal-LM backend and `Decider(level="L0")`; inspect the
  returned `distribution` and explicit `level` before acting.
- **Tacit service:** approve the checkpoint, vLLM engine, loopback endpoint,
  and compute first; then verify `/health`, `/v1/stats`, and one `/v1/decide`.
- **No-download smoke:** use `FakeBackend` only to exercise prompt/readout
  plumbing and state clearly that it says nothing about accuracy.

## Best practices

1. Keep model/dataset downloads, optional installs, remote-server calls, and
   provider credentials opt-in; local inference still consumes compute.
2. Prefer `Decider(level="L0")` when option-order bias matters and enforce the
   level; choose `prior="content_free"` or `prior="none"` deliberately.
3. Calibrate adaptive shifts with `canonical_order=True`; the certificate is
   agreement with full-K AnyJev output, not external accuracy.
4. Treat Decider `answer_mass` as prompt-landed evidence; treat Tacit's `margin`
   and `route` as diagnostics, not universal confidence; keep its escalation cap
   enabled for shared services.
5. Treat GGUF/Hugging Face tokenizer disagreement as a safe failure and keep
   non-loopback gateways behind authentication and network policy.
6. Preserve Apache-2.0 notices and identify benchmark dataset licenses; do not
   generalize isolated decision evidence into agent-loop claims.

## References

- [`references/upstream.md`](references/upstream.md) — pinned commands, backend
  contracts, tokenizer/calibration limits, gateway boundary, and source index.
- [`scripts/preflight.py`](scripts/preflight.py) — offline metadata and checkout
  shape/commit preflight; it never imports AnyJev or invokes providers.
- [AnyJev pinned repository](https://github.com/nokia-applied-research/AnyJev/tree/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9)
- [AnyJev Apache-2.0 license](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/LICENSE)
