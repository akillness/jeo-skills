# Genkit modes and routing

## Mode selector

### 1. Flow-foundation mode
Use when the main need is one reusable backend AI capability with a clean contract.

Good fits:
- summarize or classify content server-side
- expose one AI-backed endpoint to multiple clients
- convert duplicated prompt logic into one maintainable flow

### 2. Tool-and-agent mode
Use when the flow must trigger deterministic actions or coordinate with trusted tools.

Good fits:
- support assistant that files tickets
- internal copilot that queries one or two services
- backend workflow with explicit model/tool boundaries

### 3. Retrieval-and-prompt mode
Use when grounding and prompt management matter more than raw generation.

Good fits:
- knowledge-backed assistant
- doc-grounded answerer
- prompt-file-driven feature with structured output

### 4. Evaluation-and-observability mode
Use when Genkit already exists and the bottleneck is confidence, not implementation.

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

### 6. Comparison-or-fallback mode
Use when the user is still deciding whether Genkit should exist at all.

Good fits:
- Genkit vs Firebase AI Logic
- Genkit vs direct SDK route handler
- Genkit vs Vercel AI SDK / another framework
- small backend feature that may not justify a workflow layer

## Route-outs
- Direct Firebase app/client SDK integration → `firebase-ai-logic`
- Firebase CLI / emulator / project operations → `firebase-cli`
- Generic architecture / framework discovery → `survey`
- Frontend-only app wiring → relevant web/frontend skill
- Thin synchronous backend model call → plain provider SDK / route-handler fallback
- Durability / retries / background execution dominating the problem → queue/job/workflow substrate note

## Boundary reminder
If the request never leaves the app layer, never needs server-owned orchestration, or is still mostly a framework-choice question, Genkit is probably not the right first answer.
