---
name: langsmith
description: >
  Instrument, trace, evaluate, and review LLM applications with LangSmith by choosing the
  right workflow first: debugging traces, offline evals, online feedback/review queues,
  prompt-registry work, or multi-service trace propagation. Use when the user needs
  LangSmith for LLM observability, LangChain tracing, `@traceable` / `traceable`,
  provider wrappers like `wrap_openai` / `wrapOpenAI`, dataset-backed regression checks,
  annotation queues, experiment comparison, or prompt/version review; even if they only
  mention trace IDs, LLM judge scores, human feedback, run trees, prompt hub, or
  production confidence for an AI feature. Not for generic alerting/SLO design,
  deployment orchestration, or runtime guardrails outside LangSmith.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
license: MIT
compatibility: >
  Works best when LangSmith is already the chosen tracing/eval substrate or the user needs
  help deciding how to instrument/debug/evaluate an LLM app. Best with Python or
  TypeScript projects plus access to `LANGSMITH_API_KEY`; self-hosted setups may also need
  `LANGSMITH_ENDPOINT` and `LANGSMITH_WORKSPACE_ID`.
metadata:
  tags: langsmith, langchain, tracing, observability, evaluation, llm-monitoring, prompt-hub, datasets, openevals
  version: "2.0.0"
  source: https://docs.langchain.com/langsmith/home
---

# LangSmith

Use this skill to turn a vague “set up LangSmith” request into a **mode-specific operator packet**.

The goal is **not** to dump SDK trivia.
The goal is to decide:
1. what LangSmith workflow the user actually needs,
2. how much instrumentation is required,
3. what should stay inside LangSmith versus route out to adjacent skills,
4. what evidence packet to produce before implementation or rollout.

Read [references/modes-and-routing.md](references/modes-and-routing.md) before handling mixed requests that blur tracing, evals, feedback workflows, prompt registry work, and generic observability.
Read [references/python-sdk.md](references/python-sdk.md) for Python-specific API details.
Read [references/typescript-sdk.md](references/typescript-sdk.md) for TypeScript-specific API details.
Read [references/cli.md](references/cli.md) when the user needs CLI export/list/get workflows rather than SDK code.

## When to use this skill
- Add or review LangSmith tracing for a chat app, RAG pipeline, tool-calling backend, or agent workflow
- Choose between quick wrapper-based tracing, targeted decorators, or more explicit manual tracing
- Build offline evals on a dataset before a prompt/model/app change ships
- Add online feedback, annotation queues, or review rubrics for production traces
- Compare prompt or model variants with experiment runs and judge/evaluator packets
- Decide whether Prompt Hub should own the prompt lifecycle for this workflow
- Correlate multi-service traces by propagating parent context across jobs, workers, or microservices
- Audit an existing LangSmith setup that “collects traces” but still does not give trustworthy debugging or launch confidence

## When not to use this skill
- **Generic metrics / logs / dashboards / SLO / alert design** → use `monitoring-observability`
- **Root-cause triage on existing logs or stack traces** → use `log-analysis`
- **Code-level reproduction and bug isolation** → use `debugging`
- **Performance bottleneck diagnosis after measurements exist** → use `performance-optimization`
- **Deployment / rollout orchestration** → use `deployment-automation`
- **Runtime guardrails / approval policies / safety middleware** → use the appropriate runtime-policy or security skill instead of overclaiming LangSmith as the control plane

## Mode selection
Choose one primary mode before suggesting code or CLI commands.

| Mode | Use when | Main output |
|------|----------|-------------|
| Debugging traces | The team cannot explain what the app/agent actually did | trace-debug packet |
| Offline evals | A change needs regression confidence before shipping | eval packet |
| Online feedback & review | Production traces need human or automated quality scoring | review packet |
| Prompt registry & experiment comparison | Prompt/version choice is the bottleneck | prompt packet |
| Multi-service / agent propagation | Runs span services, jobs, or agent/tool boundaries | propagation packet |
| Audit / gap review | LangSmith exists already but confidence is still low | audit packet |

If multiple modes appear, pick the bottleneck first and list the others as follow-ups.

## Instructions

### Step 1: Label the workflow before choosing APIs
Capture the minimum facts first.

Record:
- app shape: chat app | RAG | tool-calling backend | agent | batch job | multi-service system | mixed
- language/runtime: Python | TypeScript | mixed | unknown
- request type: new setup | debug issue | eval rollout | prompt comparison | feedback queue | audit
- current evidence: traces | datasets | evaluators | feedback configs | prompt versions | none
- confidence problem: missing traces | noisy traces | no regression gate | no review rubric | prompt drift | missing cross-service correlation
- environment: local | staging | preview | prod | mixed

Do **not** start with “should I use `@traceable`?” Start by labeling the workflow.

### Step 2: Choose the primary LangSmith mode

#### Mode A — Debugging traces
Use when the real question is “what happened?”

Focus on:
- trace tree coverage across app, LLM, retrieval, tools, and downstream services
- project/tag/metadata standards so traces are queryable later
- whether provider wrappers are enough or explicit decorators/contexts are needed
- explicit flush behavior for short-lived scripts/jobs

Return:
- tracing surface to instrument first
- minimum metadata/tags to attach
- wrapper vs decorator vs manual trace choice
- route-out if the real problem is generic infra observability or log triage

#### Mode B — Offline evals
Use when the team needs a regression gate before shipping a change.

Focus on:
- dataset scope and example shape
- deterministic evaluator vs LLM-as-judge vs pairwise comparison
- experiment naming and baseline/candidate comparison
- concurrency / cost awareness

Return:
- dataset packet
- evaluator packet
- experiment packet
- “ship / not yet” confidence note

#### Mode C — Online feedback & review
Use when traces exist but quality review is weak.

Focus on:
- feedback schema and score semantics
- annotation queue design and required rubric items
- who will review and when
- how run IDs / trace IDs get preserved for later feedback attachment

Return:
- feedback keys + scale definitions
- queue/rubric packet
- reviewer workflow
- route-out if the user really needs product analytics, support ops, or moderation tooling instead

#### Mode D — Prompt registry & experiment comparison
Use when prompt/version choice is the bottleneck.

Focus on:
- whether Prompt Hub should own the prompt or the team should stay in Git/app config
- version pinning and experiment comparison
- pull/push workflow boundaries
- how prompts connect to datasets/evals

Return:
- prompt registry decision
- baseline vs candidate comparison packet
- explicit note if Prompt Hub is optional rather than required

#### Mode E — Multi-service / agent propagation
Use when one user request becomes multiple runs across services, jobs, or agents.

Focus on:
- parent/child context propagation
- shared trace identifiers and metadata
- service boundary handoffs
- what still belongs in generic observability/cost dashboards outside LangSmith

Return:
- propagation packet
- required headers/IDs
- missing correlation risks
- route-out if the main job is distributed-systems observability rather than LangSmith instrumentation

#### Mode F — Audit / gap review
Use when LangSmith is already installed but trust is low.

Focus on:
- missing instrumentation coverage
- empty or noisy metadata
- absent evals / weak review rubrics
- prompt/version ambiguity
- missing trace flush or run-ID preservation

Return:
- gap list by severity
- first ratchet to add next
- route-outs to adjacent skills

### Step 3: Choose the instrumentation surface

| Choice | Use when | Strengths | Risks |
|---|---|---|---|
| Provider wrappers (`wrap_openai`, `wrap_anthropic`, `wrapOpenAI`) | Need fast coverage around model calls | Quickest adoption, low touch | Misses non-model workflow context unless paired with higher-level traces |
| Decorators / `traceable()` | Need named workflow spans around application functions | Clear trace boundaries, reusable | Still requires explicit placement |
| `tracing_context(...)` / manual trace blocks | Need scoped or temporary tracing | Good for audits, tests, suspicious blocks | Easy to under-instrument if used as the only approach |
| Cross-service header propagation | Request spans multiple services/jobs | Preserves trace lineage | Manual glue; easy to forget |
| CLI export/list/get flows | Need read/export/audit operations more than instrumentation | Useful for scripts and audits | Not a substitute for instrumentation design |

Rules:
- Prefer the **smallest useful coverage** first instead of tracing everything blindly.
- Always set a clear project/workspace/environment grouping.
- Use tags/metadata that match the question you will ask later.
- If traces will be reviewed after the fact, preserve `run_id` / `trace_id` explicitly.
- If the process is short-lived, include a flush/wait step before exit.

### Step 4: Choose the evaluation packet

| Eval type | Use when | Notes |
|---|---|---|
| Heuristic / code evaluator | Output can be checked deterministically | Best first choice for factual or structural checks |
| LLM-as-judge (`openevals`) | Quality is subjective or reference-light | Good for style/helpfulness/safety packets, but not ground truth |
| Human review | Stakes are high or judgments are nuanced | Needs rubric and reviewer workflow |
| Pairwise comparison | Comparing baseline vs candidate | Good for prompt/model swaps |
| Online evaluator | Production traces need ongoing scoring | Pair with explicit review/alert semantics |

Do **not** claim one eval type replaces the others. Mixed stacks are normal.

### Step 5: Produce a concrete LangSmith packet

Return a compact plan with:
- selected mode
- chosen instrumentation surface
- required env/config (`LANGSMITH_API_KEY`, project/workspace/env, endpoint if self-hosted)
- required metadata / IDs / tags
- dataset/evaluator/review design if applicable
- route-outs to adjacent skills
- verification step

### Step 6: Use route-outs aggressively

Route out when:
- the main issue is generic dashboards / alerts / telemetry ownership → `monitoring-observability`
- the main issue is reproducing a bug rather than collecting traces → `debugging`
- the main issue is runtime guardrails or approval logic → the relevant policy/security skill
- the main issue is rollout, release, or deployment procedure → `deployment-automation`
- the main issue is generic data interpretation after exports exist → `data-analysis`

## Examples

### Example 1: Quick tracing packet
**Prompt:** “Add LangSmith tracing to this FastAPI RAG app.”

Use this skill to:
- label it as **debugging traces**
- choose wrappers plus higher-level decorators if retrieval/tools must be visible
- define project/tags/metadata and a flush step for short-lived scripts
- route out generic infra dashboards to `monitoring-observability`

### Example 2: Eval rollout packet
**Prompt:** “Before we ship this prompt change, build a LangSmith eval gate.”

Use this skill to:
- label it as **offline evals**
- define dataset shape, baseline/candidate comparison, and evaluator mix
- separate deterministic checks from LLM-as-judge and human review
- return a compact experiment packet instead of raw SDK trivia

### Example 3: Human review queue packet
**Prompt:** “Our support copilot has traces, but nobody trusts the responses. Set up review.”

Use this skill to:
- label it as **online feedback & review**
- define feedback keys, rubric items, queue flow, and run-ID preservation
- clarify what belongs in LangSmith versus product analytics or support ops tooling

### Example 4: Prompt Hub decision
**Prompt:** “Should we store these prompts in LangSmith or keep them in Git?”

Use this skill to:
- label it as **prompt registry & experiment comparison**
- compare Prompt Hub against Git/app-config ownership
- define how prompt versions connect to experiments and rollout confidence

### Example 5: Multi-service trace propagation
**Prompt:** “One chat request fans out to workers and tools — how do we keep one trace?”

Use this skill to:
- label it as **multi-service / agent propagation**
- define parent/child propagation and shared metadata requirements
- route out generic distributed-systems observability concerns when LangSmith alone is not enough

## Best practices
1. Start with the **workflow mode**, not the SDK call.
2. Treat LangSmith as a **trace/eval/review substrate**, not the entire production control plane.
3. Preserve `run_id`, `trace_id`, tags, and metadata deliberately; they are the handle for later debugging and feedback.
4. Prefer the smallest instrumentation surface that answers the current question.
5. Separate deterministic evaluators, LLM judges, and human review instead of pretending one replaces the others.
6. Be explicit when Prompt Hub is optional.
7. Include shutdown flush behavior for CLIs, scripts, workers, and cron-style jobs.
8. Route generic observability, deployment, and runtime-policy requests elsewhere instead of overextending this skill.

## References
- `references/modes-and-routing.md` — workflow modes, operator packets, and route-outs
- `references/python-sdk.md` — Python client, decorators, evaluators, feedback, annotation queues
- `references/typescript-sdk.md` — TypeScript wrappers, evaluators, feedback, LangChain callbacks
- `references/cli.md` — CLI list/get/export flows for traces, runs, datasets, experiments
- Official docs: https://docs.langchain.com/langsmith
- SDK repo: https://github.com/langchain-ai/langsmith-sdk
- OpenEvals: https://github.com/langchain-ai/openevals
