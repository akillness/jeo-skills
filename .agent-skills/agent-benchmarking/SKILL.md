---
name: agent-benchmarking
description: Map agent capabilities to standard benchmarks (SWE-bench, WebArena, OSWorld, GAIA, TauBench) plus custom regression packs. Use when you need defensible numbers on agent quality, not just vibes — before shipping, after every model change, and for vendor comparisons.
---

# Agent Benchmarking

## Overview

Vibes don't survive production. This skill picks the right standard benchmark for the agent's domain, builds a custom regression pack from real failures, and wires both into CI so quality is tracked, not assumed.

## When to use

- Choosing or upgrading a base model
- Comparing your agent vs vendor agent
- Catching capability regressions across releases
- Defending agent quality to stakeholders with numbers

## Standard benchmarks (2026)

| Domain | Benchmark | Measures |
|--------|-----------|----------|
| Coding | **SWE-bench Verified** | Real GitHub issue resolution |
| Coding (long) | **SWE-bench Live** | Continuously refreshed issues |
| Web browsing | **WebArena** | Multi-step web tasks |
| Desktop / OS | **OSWorld** | Real desktop apps, multi-modal |
| General assistant | **GAIA** | Tool use, reasoning, multi-modal |
| Tool use | **TauBench** | Multi-turn customer-service simulation |
| Reasoning | **HLE** (Humanity's Last Exam) | Hard graduate-level reasoning |
| Long horizon | **AgentBench** | Composite, multiple env |

Pick by domain, not by leaderboard popularity.

## Custom regression pack

Standard benchmarks miss *your* failure modes. Build a regression pack from:
1. Production bug reports (anonymized)
2. Postmortems → "agent should have done X"
3. Red-team finds (see `agent-guardrails`)
4. Edge cases discovered during eval

Format: same as your standard benchmark (one task → one expected outcome) so the harness is shared.

## Layout

```
benchmarks/
  swe_verified/        # vendored subset for CI speed
  custom_regression/
    cases/
      <id>/task.yaml
      <id>/expected.json
  runners/
    swe_runner.py
    custom_runner.py
  results/
    <ts>/scores.json
```

## CI integration

```yaml
# Run on every PR
- name: regression-pack
  run: pytest benchmarks/custom_regression/  # fast, ~5min
  required: true

# Run nightly
- name: swe-bench-verified-50
  run: python benchmarks/runners/swe_runner.py --subset 50
  threshold: pass_rate >= 0.55  # block release if below

# Run weekly
- name: full-swe-bench-verified
  run: python benchmarks/runners/swe_runner.py
```

## Scoring rules

- **Pass rate**: primary metric for binary tasks
- **Partial credit**: only when benchmark defines it (don't invent)
- **Cost per task**: secondary, track alongside pass rate
- **p95 latency**: SLO-relevant
- Report **all three** — pass rate alone hides cost/latency regressions

## Vendor comparison protocol

When comparing agents/models:
1. Same prompts, same tools, same harness
2. Same retry budget, same timeout
3. Disclose any prompt tuning per vendor
4. N runs ≥ 3 with mean ± stddev (LLMs are noisy)
5. Statistical test (e.g., paired bootstrap) before claiming "better"

## Anti-patterns

- Benchmark cherry-picking — pick the one your agent wins → never trustworthy
- Train-on-test contamination — verify SWE-bench Verified, not full SWE-bench
- "We beat GPT-4 on our internal eval" — internal eval is regression pack, not benchmark
- Ignoring cost / latency — high pass rate at 10× cost is not progress

## Quick start

```bash
pip install swebench webarena
python -m swebench.harness.run_evaluation \
  --predictions_path my_agent_preds.jsonl \
  --max_workers 4 \
  --run_id my_agent_v0.4
```

## Further reading

- SWE-bench Verified / Live
- WebArena, OSWorld, GAIA, TauBench, HLE
- Pair with: `agent-evaluation`, `multi-agent-eval-harness`
