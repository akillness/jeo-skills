---
name: langsmith
description: >
  Route LangSmith work into one workflow packet before touching SDK code.
  Use when the user needs LangSmith tracing, offline evals, annotation/review queues,
  prompt-registry decisions, audit/gap review, or cross-service trace propagation for
  an LLM app or agent workflow. Choose one packet: trace-debug, eval, review,
  prompt-registry, propagation, or audit. Triggers on: LangSmith, LangChain tracing,
  `@traceable` / `traceable`, `wrap_openai` / `wrapOpenAI`, datasets, experiments,
  annotation queues, feedback criteria, Prompt Hub, run trees, trace IDs, or
  production confidence for an AI feature. Not for generic SLO/alert design,
  non-LangSmith deployment orchestration, or runtime guardrails outside LangSmith.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
license: MIT
compatibility: >
  Works best when LangSmith is already the chosen tracing/eval substrate or the user
  needs help deciding how to instrument, debug, evaluate, or review an LLM app.
  Best with Python or TypeScript projects plus access to `LANGSMITH_API_KEY`;
  self-hosted setups may also need `LANGSMITH_ENDPOINT` and `LANGSMITH_WORKSPACE_ID`.
metadata:
  tags: langsmith, langchain, tracing, observability, evaluation, llm-monitoring, prompt-hub, datasets, openevals
  version: "2.1.0"
  source: https://docs.langchain.com/langsmith/home
---

# LangSmith

## When to use this skill
- The user already chose **LangSmith** and needs the smallest useful packet for tracing, evals, review, prompt ownership, or trace propagation.
- A request mentions **LangChain tracing**, **`@traceable` / `traceable`**, **`wrap_openai` / `wrapOpenAI`**, **annotation queues**, **run trees**, **trace IDs**, **datasets**, or **experiment comparison**.
- The team needs to decide whether a change needs **debugging traces**, an **offline eval gate**, an **online review queue**, **Prompt Hub / prompt-registry** work, or **multi-service lineage**.
- The user has some LangSmith setup already, but confidence is still low and they need an **audit / gap review**.

Do **not** use this skill as the main workflow when:
- The real job is **generic dashboards / alerts / SLOs / telemetry ownership** → `monitoring-observability`
- The real job is **existing-log root-cause triage** → `log-analysis`
- The real job is **code-level reproduction / bug isolation** → `debugging`
- The real job is **deployment / rollout choreography** → `deployment-automation`
- The real job is **generic exported-metrics interpretation or KPI synthesis** → `data-analysis`
- The real job is **runtime guardrails / approvals / policy middleware** → the relevant security or policy skill

## Core idea
`langsmith` should behave like a **workflow packet router**, not a giant SDK encyclopedia.

1. Label the request before naming APIs.
2. Choose **one primary packet**.
3. Pick the smallest instrumentation / eval / review surface that answers the question.
4. Return a compact operator brief.
5. Route adjacent observability, debugging, deployment, and policy work outward fast.

Read these support docs before choosing the packet:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/modes-and-routing.md](references/modes-and-routing.md)
- [references/python-sdk.md](references/python-sdk.md)
- [references/typescript-sdk.md](references/typescript-sdk.md)
- [references/cli.md](references/cli.md)

## Instructions

### Step 1: Normalize the request
Convert the prompt into this intake packet first:

```yaml
langsmith_packet:
  primary_packet: trace-debug | eval | review | prompt-registry | propagation | audit
  app_shape: chat | rag | tool-calling | agent | batch-job | multi-service | mixed | unknown
  runtime: python | typescript | mixed | cli-only | unknown
  request_type: setup | debug | pre-ship gate | production review | prompt decision | cross-service tracing | audit
  current_evidence: traces | datasets | evaluators | feedback queues | prompt versions | exported runs | none
  confidence_problem: missing traces | noisy traces | no regression gate | weak review rubric | prompt drift | broken lineage | mixed | unknown
  route_after: stay-here | monitoring-observability | log-analysis | debugging | deployment-automation | data-analysis
```

Choose **one** primary packet for the run. If two seem plausible, pick the one that reduces uncertainty fastest.

### Step 2: Choose the packet

| Packet | Use when | Main output | Typical signals |
|---|---|---|---|
| `trace-debug` | The real question is “what happened?” | trace-debug packet | missing visibility, wrappers/decorators, trace coverage, metadata discipline |
| `eval` | A change needs pre-ship or regression confidence | eval packet | dataset creation, evaluators, experiments, baseline/candidate comparison |
| `review` | Traces exist but trust is weak in production | review packet | annotation queues, feedback criteria, human scoring, inline review |
| `prompt-registry` | Prompt/version ownership is the bottleneck | prompt packet | Prompt Hub, prompt versions, Git sync, compare prompt variants |
| `propagation` | One request spans services, jobs, tools, or agents | propagation packet | parent/child trace IDs, cross-service headers, multi-hop lineage |
| `audit` | LangSmith is present but still not useful | audit packet | noisy traces, missing IDs, absent evals, unclear prompt ownership |

Packet rules:
- Prefer `trace-debug` when the team cannot explain the run tree.
- Prefer `eval` when the next risk is shipping without a regression gate.
- Prefer `review` when real-user output needs human or structured quality feedback.
- Prefer `prompt-registry` only when prompt/version choice is the actual bottleneck.
- Prefer `propagation` when one request fans out beyond a single service boundary.
- Prefer `audit` when the system already “has LangSmith” but confidence is still low.

### Step 3: Pick the smallest useful surface

| Surface | Use when | Strengths | Risks |
|---|---|---|---|
| Provider wrappers (`wrap_openai`, `wrap_anthropic`, `wrapOpenAI`) | Need quick model-call coverage | Fastest path to visible traces | Misses higher-level workflow context if used alone |
| Decorators / `traceable()` | Need named spans around app functions | Clear span boundaries, reusable | Still needs deliberate placement |
| Manual trace blocks / tracing context | Need scoped or temporary visibility | Good for audits and suspicious blocks | Easy to under-instrument |
| Annotation queues + feedback criteria | Need structured human review | Preserves rubric and reviewer flow | Review ownership still has to be designed |
| Dataset + experiment workflow | Need benchmark or regression checks | Gives pre-ship comparison | Can drift into generic eval theory if not bounded |
| CLI export/list/get flows | Need audit/export operations more than instrumentation | Good for scripts and inspection | Not a substitute for instrumentation design |
| Cross-service propagation headers / metadata | Need end-to-end lineage | Preserves parent/child context | Easy to forget at service boundaries |

Rules:
- Prefer the **smallest surface** that answers the present question.
- Always name project/workspace/environment grouping.
- Preserve `run_id`, `trace_id`, and metadata if humans or downstream tools will review runs later.
- Include shutdown flush / wait behavior for CLIs, workers, and short-lived jobs.

### Step 4: Choose the eval or review layer only when needed

| Layer | Use when | Notes |
|---|---|---|
| Deterministic / code evaluator | Output can be checked mechanically | Best first choice for structure/factual rules |
| LLM-as-judge (`openevals`) | Quality is subjective or reference-light | Useful, but not ground truth |
| Human review | Stakes are high or nuance dominates | Needs rubric, reviewer, and cadence |
| Pairwise comparison | Two prompts/models/app versions are being compared | Good for baseline vs candidate decisions |
| Online evaluator | Production traffic needs ongoing scoring | Pair with explicit alert/review semantics |

Do **not** pretend one layer replaces the others.

### Step 5: Return one compact LangSmith brief
Default response shape:

```markdown
## LangSmith brief
- Packet: trace-debug | eval | review | prompt-registry | propagation | audit
- App shape: ...
- Runtime: ...
- Current evidence: ...

## Chosen surface
- wrappers / decorators / manual trace / dataset+experiment / review queue / prompt registry / propagation headers

## Required config
- `LANGSMITH_API_KEY`
- project/workspace/environment
- endpoint/workspace overrides if self-hosted

## Required IDs / metadata
- `run_id`, `trace_id`, tags, metadata fields, user/session identifiers as needed

## Verification step
- one trace query, one experiment comparison, one queue review check, or one prompt-version sanity check

## Route-out
- next neighboring skill if the bottleneck moves
```

Keep it compact. The point is to leave the user with one smallest next artifact, not a wall of SDK notes.

### Step 6: Packet-specific heuristics

#### For `trace-debug`
- Start from the missing visibility surface: app span, tool calls, retrieval, provider call, or worker boundary.
- Prefer wrappers plus a few high-value decorators over tracing everything blindly.
- Return the first trace query/filter the team should run once instrumentation lands.

#### For `eval`
- Define the smallest dataset that reflects the risky change.
- Separate deterministic checks from LLM-as-judge or human review.
- Name baseline/candidate comparison, experiment naming, concurrency/cost limits, and the ship/no-ship decision point.

#### For `review`
- Define feedback keys, scale semantics, reviewer ownership, and queue cadence.
- Preserve `run_id` / `trace_id` so feedback attaches to the right artifact later.
- Route broader support-ops workflows out if the issue is bigger than output review.

#### For `prompt-registry`
- Explicitly decide whether Prompt Hub / LangSmith should own the prompt or whether Git/app config should stay canonical.
- Connect prompt versions to evals or experiments; do not treat registry as a separate island.
- Be explicit when public hub browsing is reference-only rather than the team's source of truth.

#### For `propagation`
- Name parent/child headers, metadata handoff rules, and which services must preserve trace context.
- Keep distributed-systems reliability and alerting concerns routed to generic observability where appropriate.

#### For `audit`
- Rank gaps by severity: missing coverage, bad metadata, absent evals, weak review flow, prompt/version ambiguity, broken flush or lineage.
- Recommend the **first ratchet**, not a giant reinstall plan.

### Step 7: Route out aggressively
Switch as soon as LangSmith is no longer the main bottleneck:
- **Generic telemetry / dashboards / alerts / SLOs** → `monitoring-observability`
- **Existing-log root-cause triage** → `log-analysis`
- **Reproduction and bug isolation** → `debugging`
- **Rollout / deploy / environment promotion** → `deployment-automation`
- **Exported metrics, experiments, or KPI interpretation** → `data-analysis`
- **Policy / approval / runtime guardrails** → the relevant security or policy skill

## Examples

### Example 1: Trace-debug packet
**Prompt:**
> Add LangSmith to this FastAPI RAG service so we can debug why answer quality regressed after a retriever change.

**Good response shape:**
- choose `trace-debug`
- recommend wrappers plus targeted higher-level spans if retrieval/tools must be visible
- define project/tags/metadata and a flush step for short-lived runs
- route generic service-health observability outward

### Example 2: Eval packet
**Prompt:**
> Before we ship this prompt rewrite, build a LangSmith eval workflow with a baseline, a candidate, and one judge for subjective quality.

**Good response shape:**
- choose `eval`
- define dataset, evaluator mix, experiment naming, and verification step
- separate deterministic checks from LLM-as-judge and human review
- keep rollout orchestration out of scope

### Example 3: Review packet
**Prompt:**
> We already have LangSmith traces, but support leads still do not trust the AI assistant. Set up a review workflow with human scoring.

**Good response shape:**
- choose `review`
- define feedback keys, rubric, queue ownership, and run-ID preservation
- keep the answer grounded in review workflow rather than generic prompt management

### Example 4: Prompt-registry packet
**Prompt:**
> Should these prompts live in LangSmith Prompt Hub or stay in Git?

**Good response shape:**
- choose `prompt-registry`
- compare platform-owned vs Git-owned prompt source of truth
- connect the choice to experiments and release confidence
- stay honest when Prompt Hub is optional

### Example 5: Propagation packet
**Prompt:**
> One chat request fans out to workers and tools. How do we keep one trace through LangSmith?

**Good response shape:**
- choose `propagation`
- define parent/child IDs, metadata propagation, and service boundaries
- route generic distributed-systems observability outward when needed

## Best practices
1. Start with the **packet**, not the SDK call.
2. Treat LangSmith as a **trace/eval/review substrate**, not the entire production control plane.
3. Preserve `run_id`, `trace_id`, tags, and metadata deliberately.
4. Prefer the smallest useful surface that answers the present question.
5. Keep deterministic checks, LLM judges, and human review distinct.
6. Be explicit when Prompt Hub is optional or reference-only.
7. Include flush/wait behavior for scripts, workers, and cron-style jobs.
8. End with one verification step and one route-out.

## References
- `references/intake-packets-and-route-outs.md`
- `references/modes-and-routing.md`
- `references/python-sdk.md`
- `references/typescript-sdk.md`
- `references/cli.md`
- Official docs: https://docs.langchain.com/langsmith
- SDK repo: https://github.com/langchain-ai/langsmith-sdk
- OpenEvals: https://github.com/langchain-ai/openevals
