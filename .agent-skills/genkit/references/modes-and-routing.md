# Genkit modes and routing

## Mode selector

### 1. Flow-foundation mode
Use when the main need is one reusable backend AI capability with a clean contract.

Good fits:
- summarize or classify content server-side
- expose one AI-backed endpoint to multiple clients
- convert a pile of prompt logic into one maintainable flow

### 2. Tool-and-agent mode
Use when the flow must trigger deterministic actions or coordinate with external tools.

Good fits:
- support assistant that files tickets
- internal copilot that queries one or two trusted services
- backend workflow with explicit model/tool boundaries

### 3. Retrieval-and-prompt mode
Use when grounding and prompt management matter more than raw generation.

Good fits:
- knowledge-backed assistant
- doc-grounded answerer
- prompt-file driven feature with structured output

### 4. Evaluation-and-observability mode
Use when Genkit exists already and the bottleneck is confidence, not implementation.

Good fits:
- launch-readiness checks
- prompt regressions
- flaky structured outputs
- traces nobody has reviewed yet

### 5. Deployment-runtime mode
Use when the flow exists and the open question is how or where to run it.

Good fits:
- Firebase vs Cloud Run choice
- callable/API shape decisions
- secret/config ownership
- rollout and monitoring planning

## Route-outs
- Direct Firebase app SDK integration → `firebase-ai-logic`
- Firebase CLI / emulator / project operations → `firebase-cli`
- Generic architecture discovery → `survey`
- Frontend-only app wiring → relevant web/frontend skill

## Boundary reminder
If the request never leaves the app layer and does not need server-owned orchestration, Genkit is probably the wrong first skill.
