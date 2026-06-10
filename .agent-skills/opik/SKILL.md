---
name: opik
description: >
  Run Comet's Opik — open-source LLM observability, evaluation, and
  optimization — from one routing-first skill: install the Python/TypeScript
  SDK, stand up a server (Comet.com cloud, Docker Compose via `./opik.sh`, or
  Kubernetes/Helm), wire tracing through `@opik.track` or one of 50+ framework
  integrations (OpenAI, Anthropic, LangChain, LangGraph, LlamaIndex, CrewAI,
  DSPy, Ollama, Bedrock, Vercel AI SDK, …), score outputs with LLM-as-a-judge
  metrics (Hallucination, Moderation, Answer Relevance, Context Precision),
  and run Datasets/Experiments evaluations including PyTest CI gates. Use when
  the user wants LLM tracing, prompt evaluation, production LLM monitoring,
  agent optimization, or guardrails with Opik. Triggers on: opik, comet opik,
  opik configure, opik.sh, llm observability, llm tracing, llm as a judge,
  hallucination metric, prompt evaluation, opik dashboard, opik guardrails,
  agent optimizer.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Cross-platform observability/eval wrapper usable from Claude Code, Codex,
  Gemini CLI, and OpenCode. Wraps the upstream Opik server (cloud, Docker,
  Kubernetes) and the Python/TypeScript SDKs. Routes LangSmith-stack work to
  `langsmith`, generic service dashboards/alerts to `monitoring-observability`,
  and offline KPI interpretation to `data-analysis`.
metadata:
  tags: opik, comet, llm-observability, tracing, evaluation, llm-as-a-judge, prompt-optimization, guardrails, monitoring, plugin
  platforms: Claude, Gemini, Codex, OpenCode, All
  keyword: opik
  version: "1.0.0"
  upstream: https://github.com/comet-ml/opik
  installer: pip install opik && opik configure
  source: akillness/oh-my-skills
---

# opik — Open-source LLM Observability, Evaluation & Optimization

[Opik](https://github.com/comet-ml/opik) (built by Comet) streamlines the
entire LLM application lifecycle: deep tracing of LLM calls and agent
activity, LLM-as-a-judge evaluation, experiment management, production
monitoring at scale (40M+ traces/day), plus the **Opik Agent Optimizer** and
**Opik Guardrails**. This skill is the routing-first wrapper — it picks the
right deployment mode, wires the SDK, and drives the trace → evaluate →
monitor → optimize loop.

## When to use this skill

- The user asks to install or configure Opik (`pip install opik`,
  `opik configure`, `./opik.sh`)
- The user wants tracing for LLM calls or agents — via `@opik.track` or a
  framework integration (OpenAI, Anthropic, LangChain, LangGraph, LlamaIndex,
  CrewAI, DSPy, Haystack, Ollama, Bedrock, Vercel AI SDK, Pydantic AI, …)
- The user wants LLM-as-a-judge metrics: hallucination detection, moderation,
  answer relevance, context precision/recall for RAG
- The user wants Datasets + Experiments evaluation, or PyTest-integrated
  LLM evaluation in CI/CD
- The user wants production LLM monitoring dashboards, online evaluation
  rules, prompt playground experiments, agent/prompt optimization, or
  guardrails

## When not to use this skill

- The stack is **LangSmith**, not Opik → use `langsmith`
- The user needs **generic service dashboards/alerts** (non-LLM telemetry,
  uptime, infra metrics) → use `monitoring-observability`
- The user wants **offline dataset/KPI interpretation** rather than LLM
  tracing/eval plumbing → use `data-analysis`
- The user is doing **root-cause log forensics** on app/container logs →
  use `log-analysis`

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Python 3.8+ (SDK) | `pip install opik` or `uv pip install opik` |
| Docker + Docker Compose | Only for local self-hosting via `./opik.sh` |
| Kubernetes + Helm | Only for scalable self-hosted deployments |
| Comet.com account | Only for the zero-setup cloud option |

## Instructions

### Step 1 — Choose the server mode

| Mode | When | How |
|------|------|-----|
| **Comet.com cloud** (easiest) | Quick start, no maintenance | [Create a free account](https://www.comet.com/signup?from=llm), get API key + workspace |
| **Docker Compose** (local) | Local dev & testing, full control | `git clone https://github.com/comet-ml/opik.git && cd opik && ./opik.sh` → UI at `localhost:5173` |
| **Kubernetes / Helm** | Production-scale self-hosting | Upstream [Helm chart guide](https://www.comet.com/docs/opik/self-host/kubernetes/) |

Docker service profiles (development scenarios):

```bash
./opik.sh              # full Opik suite (default)
./opik.sh --infra      # infrastructure only (databases, caches)
./opik.sh --backend    # infrastructure + backend services
./opik.sh --guardrails # enable guardrails with any profile
./opik.sh --help       # troubleshooting
```

Windows: `powershell -ExecutionPolicy ByPass -c ".\opik.ps1"`.

### Step 2 — Install and configure the SDK

```bash
pip install opik        # or: uv pip install opik
opik configure          # prompts for server address (self-hosted) or API key + workspace (cloud)
```

Or configure in code:

```python
import opik
opik.configure(use_local=True)   # local self-hosted instance
```

TypeScript, and Ruby (via OpenTelemetry) SDKs are also available — see the
[client reference docs](https://www.comet.com/docs/opik/reference/overview).

### Step 3 — Log traces

Prefer a native integration when the framework is supported (50+ available:
ADK, AG2, Agno, Anthropic, Autogen, Bedrock, CrewAI, DSPy, Dify, Flowise,
Gemini, Haystack, Instructor, LangChain, LangGraph, LiteLLM, LlamaIndex,
Mastra, Ollama, OpenAI, OpenAI Agents, OpenRouter, OpenTelemetry, Pydantic AI,
Ragas, Semantic Kernel, Smolagents, Spring AI, Vercel AI SDK, WatsonX, …).
See [`references/commands.md`](references/commands.md) for the full table.

Fallback for any code path — the `track` decorator (nest-aware, composes
with integrations):

```python
import opik

@opik.track
def my_llm_function(user_question: str) -> str:
    # Your LLM code here
    return "Hello"
```

Annotate traces/spans with feedback scores via the SDK or the UI.

### Step 4 — Evaluate with LLM-as-a-judge metrics

```python
from opik.evaluation.metrics import Hallucination

metric = Hallucination()
score = metric.score(
    input="What is the capital of France?",
    output="Paris",
    context=["France is a country in Europe."],
)
print(score)
```

Built-in judges include Hallucination, Moderation, Answer Relevance, Context
Precision/Recall; heuristic metrics and custom metrics are also supported.

### Step 5 — Datasets, Experiments, and CI gates

- Manage **Datasets** and run **Experiments** to compare prompt/model
  variants during development
- Wire evaluations into CI/CD with the **PyTest integration** so regressions
  block merges
- Iterate on prompts/models in the **Prompt Playground**

### Step 6 — Production monitoring and optimization

- Opik is built for scale: 40M+ traces/day ingestion
- Track feedback scores, trace counts, and token usage in the Opik Dashboard
- Add **Online Evaluation Rules** (LLM-as-a-judge on production traffic) to
  catch issues live
- Use **Opik Agent Optimizer** (dedicated SDK) to improve prompts/agents and
  **Opik Guardrails** for safe-AI policies

### Step 7 — Plugin-style installation alongside oh-my-skills

This skill folder is plugin-installable through the standard oh-my-skills
flow so the wrapper, references, and installer script land on disk for any
supported agent runtime:

```bash
# Project install (writes into .agents/skills/opik/)
npx skills add https://github.com/akillness/oh-my-skills --skill opik

# Global install for every detected agent
npx skills add -g https://github.com/akillness/oh-my-skills --skill opik

# Target specific agents
npx skills add -g https://github.com/akillness/oh-my-skills --skill opik -a claude-code -a codex -y
```

The skill also ships [`scripts/install.sh`](scripts/install.sh) as a
one-shot installer covering SDK install (uv → pip fallback) and optional
local self-hosting (`OPIK_INSTALL_MODE=local`).

## Output format

When the user asks `opik` for help, return a compact brief:

```markdown
# opik Routing Brief

## Scope
- Server mode: cloud | docker-local | kubernetes | undecided
- SDK: python | typescript | ruby-otel
- Lifecycle stage: tracing | evaluation | ci-gate | production-monitoring | optimization | guardrails

## Recommended next move
- install-sdk | opik-configure | start-local-server | wire-integration | add-judge-metric | create-dataset-experiment | enable-online-rules

## Why
- 2-3 bullets grounded in the user's packet

## Route-outs
- `langsmith` when the observability stack is LangSmith
- `monitoring-observability` for non-LLM dashboards/alerts
- `data-analysis` for offline KPI/metric interpretation
```

## Best practices

1. **Start with cloud or `./opik.sh`, not Kubernetes** — Helm is for
   production scale; local Docker Compose answers "does tracing work" in
   minutes.
2. **Prefer a native integration over hand-rolled `@opik.track`** when the
   framework is in the support table — integrations capture provider
   metadata (tokens, model, latency) automatically.
3. **Check the changelog before upgrading a self-hosted server** — e.g.
   v1.7.0 shipped breaking changes.
4. **Judge metrics need context** — `Hallucination` and RAG metrics score
   against the `context` you pass; empty context produces misleading scores.
5. **Gate CI on small, stable datasets** — PyTest-integrated experiments
   should be fast and deterministic; keep large sweeps in scheduled runs.
6. **Turn production checks into Online Evaluation Rules** instead of
   re-running offline experiments against live traffic.

## References

- Upstream repo: <https://github.com/comet-ml/opik>
- Documentation: <https://www.comet.com/docs/opik/>
- Quickstart: <https://www.comet.com/docs/opik/quickstart/>
- Integrations overview: <https://www.comet.com/docs/opik/integrations/overview/>
- Metrics overview: <https://www.comet.com/docs/opik/evaluation/metrics/overview/>
- Self-host (local): <https://www.comet.com/docs/opik/self-host/local_deployment>
- Self-host (Kubernetes): <https://www.comet.com/docs/opik/self-host/kubernetes/>
- Installer script: [`scripts/install.sh`](scripts/install.sh)
- Command + integration reference: [`references/commands.md`](references/commands.md)
- Adjacent skills: `../langsmith/SKILL.md`, `../monitoring-observability/SKILL.md`,
  `../data-analysis/SKILL.md`, `../log-analysis/SKILL.md`
- License: Apache-2.0 (see upstream `LICENSE`)
