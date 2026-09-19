---
name: agent-observability
description: Instrument LLM agents with traces, metrics, and replay. Use when an agent in production is silently failing, regressing, drifting, or burning tokens. Selects LangSmith / Langfuse / Phoenix, defines node-level spans, attaches evals to traces, and enables session replay.
---

# Agent Observability

## Overview

Production agents fail differently than services: bad tool calls, hallucinated arguments, runaway loops, silent quality regression. This skill picks an observability backend, instruments node-level spans, attaches evals to traces, and sets up replay — so failures are *observable*, not just guessed at.

## When to use

- Agent works in dev, breaks in prod with no logs that explain why
- Need to compare prompt/model changes against a baseline (eval-in-trace)
- Token/latency cost is growing and you don't know which node is the culprit
- A user reports a bad answer and you need to *replay* the exact session
- Multiple agents/subagents — you need a single trace tree, not interleaved logs

## Platform selection

| Backend | Pick when | Hosting |
|---------|-----------|---------|
| LangSmith | LangChain/LangGraph stack, want managed | SaaS |
| Langfuse | Open-source, self-host required, multi-framework | SaaS or self-host |
| Arize Phoenix | OTel-native, embed/eval drift, OSS-first | Local or self-host |

Default: **Langfuse** when you need self-host, **LangSmith** when you're already on LangGraph, **Phoenix** when OTel is mandated.

## Instrumentation pattern (node-level spans)

```python
# LangGraph + Langfuse
from langfuse.decorators import observe
from langfuse.openai import openai  # auto-traces tool calls

@observe(name="planner_node")
def planner(state):
    return {"plan": llm.invoke(state["task"])}

@observe(name="tool_executor")
def tool_executor(state):
    return {"observation": run_tool(state["action"])}
```

Required span attributes:
- `input` / `output` (full, not truncated)
- `model`, `temperature`, `max_tokens`
- `tool_name`, `tool_args`, `tool_result_status`
- `tokens_in`, `tokens_out`, `cost_usd`
- `session_id`, `user_id`, `trace_id`

## Eval-in-trace

Attach automated graders to each span so regressions surface in the same UI as latency:

```python
from langfuse import Langfuse
langfuse = Langfuse()
langfuse.score(
    trace_id=trace_id,
    name="answer_correctness",
    value=0.92,
    comment="LLM-as-judge vs golden"
)
```

Common scores: `correctness`, `tool_call_validity`, `groundedness`, `harm`, `latency_sla`.

## Replay pattern

1. Log full `state` at every node entry/exit (Langfuse: `metadata={"state": state}`)
2. On bug report, fetch trace by `trace_id`
3. Rehydrate state, re-run from any node — diff outputs

## Sampling at scale

- 100% trace error/HITL paths
- 10% sample happy path
- Tail-based sampling for spans > p95 latency
- Always log: tool failures, guardrail blocks, budget caps hit

## Further reading

- LangSmith docs — datasets, evals, trace replay
- Langfuse docs — self-host compose, OTel exporter
- Arize Phoenix — embed drift, OSS LLM evals
- OpenTelemetry `gen_ai` semantic conventions (2026)
