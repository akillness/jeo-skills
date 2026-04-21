# LangSmith Modes and Routing

## Core rule
Start by deciding **which LangSmith workflow is failing or needed**. Do not start with API snippets.

## Modes

### 1. Debugging traces
Use when the question is “what happened?” or “why did this LLM/app/agent run fail?”

Focus on:
- whether trace coverage includes the app span plus nested LLM/tool/retrieval calls
- project / environment / tag / metadata consistency
- wrapper vs decorator vs manual trace choice
- explicit flush behavior for short-lived jobs

Return:
- minimum instrumentation packet
- metadata/tag standards
- first trace query to verify success

### 2. Offline evals
Use when a prompt/model/app change needs a regression gate before release.

Focus on:
- dataset shape and coverage
- deterministic vs LLM-as-judge vs pairwise evaluation
- experiment naming and baseline/candidate comparison
- concurrency/cost bounds

Return:
- dataset packet
- evaluator packet
- experiment packet

### 3. Online feedback and review
Use when traces exist but nobody trusts output quality in production.

Focus on:
- feedback keys and scales
- annotation queue and rubric design
- reviewer ownership and cadence
- run ID / trace ID preservation

Return:
- queue/rubric packet
- required labels
- review flow

### 4. Prompt registry and experiment comparison
Use when prompt/version choice is the bottleneck.

Focus on:
- whether Prompt Hub should own prompts at all
- version pinning and experiment comparison
- Git/config alternative if LangSmith registry is not the right fit

Return:
- registry decision
- comparison packet
- route-out note if Git/app config should stay canonical

### 5. Multi-service / agent propagation
Use when one user request fans out across services, workers, tools, or agent hops.

Focus on:
- header/context propagation
- consistent metadata across spans
- what LangSmith should trace versus what generic observability should cover

Return:
- propagation packet
- required headers / IDs
- route-out to generic observability if needed

### 6. Audit / gap review
Use when LangSmith is installed but confidence is still low.

Focus on:
- missing instrumentation coverage
- noisy or useless metadata
- missing evals or weak review schema
- missing prompt/version clarity
- missing flush or run-ID preservation

Return:
- severity-ranked gap list
- next ratchet

## Route-outs
- Generic dashboards / alerts / SLOs / telemetry ownership → `monitoring-observability`
- Existing-log root-cause triage → `log-analysis`
- Code-level reproduction / bug isolation → `debugging`
- Runtime guardrails / approval logic → policy/security skill
- Rollout / deployment orchestration → `deployment-automation`
- Exported experiment/KPI interpretation → `data-analysis`

## Minimum evidence packet
For any LangSmith task, try to leave the user with:
- selected mode
- chosen instrumentation surface
- required env/config
- required metadata / IDs / tags
- eval / feedback / queue design if applicable
- verification step
- route-outs
