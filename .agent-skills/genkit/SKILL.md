---
name: genkit
description: >
  Build and operate Genkit as the full-stack AI workflow layer for web and
  backend apps. Use when the user needs server-owned AI flows, tool calling,
  prompt files, structured outputs, RAG, evaluation, observability, or
  deployment to Firebase / Cloud Run / another backend runtime. Triggers on:
  Genkit, Firebase Genkit, AI flow, tool-calling backend, Genkit evals, Genkit
  developer UI, server-side prompt workflow, and deployable AI endpoints. Route
  direct Firebase app SDK integration and simple in-app Gemini features to
  `firebase-ai-logic`.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: genkit, firebase, ai-workflows, flows, tool-calling, rag, evaluation, observability, firebase, cloud-run, fullstack
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: Firebase Genkit docs + Genkit official docs
  modernization: 2026-04-15
---

# Genkit

`genkit` is the **full-stack AI workflow / orchestration** skill for app teams that need more than a single model call.

Use it when the real problem is **owning AI behavior on the server side**: reusable flows, tool execution, retrieval, prompt files, evaluation, local observability, and deployment as backend endpoints or jobs.

Read these support docs before choosing the workflow:
- [references/modes-and-routing.md](references/modes-and-routing.md)
- [references/deployment-and-runtime-boundaries.md](references/deployment-and-runtime-boundaries.md)
- [references/evals-and-observability.md](references/evals-and-observability.md)

## When to use this skill
Use `genkit` when one or more of these are true:
- The user needs **server-owned AI flows** instead of direct client-side model calls.
- The workflow needs **tool calling, retrieval, structured outputs, or multi-step orchestration**.
- The team wants **prompt files, reusable flow contracts, or deployable AI endpoints**.
- The request involves **Genkit Developer UI, flow tracing, evaluation, or local observability**.
- The app needs to deploy AI behavior to **Firebase, Cloud Run, or another backend runtime**.
- The same AI behavior should be reused across **web, mobile, cron, internal tools, or multiple backend surfaces**.
- The request explicitly mentions Genkit, Firebase Genkit, AI flows, deployable AI workflows, tool-calling backend, RAG pipeline, or Genkit evals.

## When not to use this skill
- **The user mainly wants direct Gemini features inside a Firebase app/client SDK** → use `firebase-ai-logic`
- **The task is mainly Firebase project setup, emulators, hosting, or deploy/admin CLI work** → use `firebase-cli`
- **The request is a generic orchestration or planning workflow, not an app/backend AI framework choice** → use `survey`, `task-planning`, or the relevant orchestration skill
- **The user only needs provider-specific model access with minimal abstraction** → use the relevant provider or SDK skill instead of forcing Genkit
- **The main job is frontend UI integration and streaming UX rather than backend AI ownership** → use the relevant frontend/web skill, and only keep Genkit if the server workflow is the real center of gravity

## Quick routing rule
| If the job needs... | Use |
|---|---|
| Direct Firebase app integration for Gemini-powered product features | `firebase-ai-logic` |
| Reusable backend AI flows, tools, retrieval, evals, and deployment | `genkit` |
| Firebase project/bootstrap/deploy/admin operations | `firebase-cli` |
| Framework comparison or architecture discovery before choosing | `survey` |

## Core idea
Treat Genkit as the **workflow layer**, not just a collection of code snippets.

Genkit is strongest when you need all or most of these together:
- **generation primitives** for model calls and structured output
- **flows** as reusable backend contracts
- **tools** and agentic building blocks
- **prompt files / Dotprompt** for maintainable prompts
- **retrieval** and RAG support
- **Developer UI / tracing / local observability**
- **evaluation** for prompt and workflow quality
- **deployment** to Firebase, Cloud Run, or another backend target

If the workflow never leaves the app layer and does not need backend ownership, Genkit is often more framework than you need.

## Instructions

### Step 1: Classify whether Genkit is the right layer
Normalize the request first:

```yaml
genkit_intake:
  app_shape: web | mobile | backend | fullstack | mixed | unknown
  ownership: client-feature | backend-workflow | mixed | unknown
  workflow_need:
    - simple-generation
    - structured-output
    - tool-calling
    - retrieval-rag
    - prompt-files
    - evals
    - observability
    - deployment
  deployment_target: firebase | cloud-run | other-backend | local-only | unknown
  runtime_language: typescript | go | python | mixed | unknown
  reuse_scope: one-feature | several-endpoints | cross-surface | unknown
```

Choose `genkit` when the dominant need is **backend-owned AI workflow structure**.
If the request is really just app-side Firebase model usage, route out to `firebase-ai-logic`.

### Step 2: Choose one operating mode
Pick one primary mode before writing code or commands:

1. **flow-foundation mode**
   - Use when the team needs a reusable flow contract for one backend AI task.
   - Output: flow boundary, input/output schema, model/tool plan, and runtime choice.

2. **tool-and-agent mode**
   - Use when the app needs tool calling, external actions, or agentic patterns.
   - Output: tool boundary, safety notes, flow/tool split, and execution plan.

3. **retrieval-and-prompt mode**
   - Use when the app needs RAG, prompt files, context injection, or structured grounding.
   - Output: retrieval plan, prompt contract, evaluation targets, and deployment notes.

4. **evaluation-and-observability mode**
   - Use when the team already has Genkit flows and needs confidence, traces, or quality checks.
   - Output: eval harness shape, trace/debug loop, metrics to watch, and iteration plan.

5. **deployment-runtime mode**
   - Use when the AI workflow exists and the main question is Firebase vs Cloud Run vs another runtime.
   - Output: deployment boundary, secret/config plan, serving shape, and rollout checklist.

Return the chosen mode explicitly before continuing.

### Step 3: Freeze the flow boundary before implementation
Define the smallest useful workflow contract:
- what input enters the flow
- what output leaves the flow
- which steps must stay server-side
- which provider/model assumptions matter
- where tools/retrieval fit, if anywhere

A good Genkit boundary usually looks like:
- **one named backend capability**
- **typed input/output contract**
- **clear server ownership**
- **observable execution path**

Bad boundaries:
- “put every AI feature in one mega-flow”
- “use Genkit because the app uses Firebase, even though the work is client-only”
- “start with tool calling, retrieval, and evals before one basic flow works”

### Step 4: Pick the right runtime shape
Use the runtime choice as a product/operations decision, not a default reflex.

| Runtime shape | Use when | Watch for |
|---|---|---|
| **Firebase-backed app + server workflow** | The app already lives in Firebase and you want close platform alignment | Secret handling, callable/API shape, rollout ownership |
| **Cloud Run / generic backend service** | You need a more explicit service boundary or non-Firebase backend control | Deployment pipeline, auth between services, scaling/cold-start tradeoffs |
| **Local-only dev loop first** | You are still proving the workflow and need tracing/debugging before deployment | Do not mistake local success for production readiness |

Read [references/deployment-and-runtime-boundaries.md](references/deployment-and-runtime-boundaries.md) before choosing.

### Step 5: Build the minimum useful Genkit workflow
Use this default build order:
1. choose provider + model
2. define input/output schema
3. implement one flow
4. run it in the local dev loop / Developer UI
5. add tools or retrieval only if the job actually requires them
6. add evaluation and observability before scaling usage
7. deploy only after the workflow contract is stable enough

Typical Genkit building blocks:
- `genkit()` runtime setup
- `generate()` / structured output
- `defineFlow()`
- prompt files / Dotprompt
- `defineTool()` when the model needs real actions
- retrieval support only when grounding matters
- evals / observability for quality and regression control

### Step 6: Use Developer UI and traces early
The Genkit dev loop is part of the value proposition, not an afterthought.

Use Developer UI / local tracing when:
- the flow shape is still changing
- prompts are unstable
- tool or retrieval steps need inspection
- structured output is brittle
- you need evidence before rollout

Questions to answer in the trace/debug loop:
- where does the workflow actually fail?
- is the schema right, or is the prompt compensating for a bad contract?
- should a tool or retrieval step live outside the model loop?
- does this need a formal eval set yet?

### Step 7: Add tools, retrieval, or agents only when justified
Use Genkit's richer workflow surface carefully.

Add **tools** when the model must trigger deterministic actions.
Add **retrieval/RAG** when the workflow needs external knowledge grounding.
Add **multi-step or agentic patterns** when a single well-bounded flow is not enough.

Do not add all three at once without proving why each one is necessary.
A smaller flow with a crisp schema beats a giant "AI system" that nobody can debug.

### Step 8: Decide how evaluation will work
If the workflow matters in production, evaluation cannot stay implicit forever.

Minimum useful evaluation questions:
- what good output looks like
- what failures are unacceptable
- which sample inputs represent real usage
- whether quality should be checked manually, automatically, or both

Genkit should own the **evidence loop** for prompt/workflow quality once the feature matters enough to be maintained over time.
Read [references/evals-and-observability.md](references/evals-and-observability.md) before adding quality gates.

### Step 9: Route out honestly
`genkit` should stay narrow enough to be useful.

Route out when the request is really about:
- **direct Firebase app SDK integration** → `firebase-ai-logic`
- **Firebase CLI, emulators, hosting, or admin operations** → `firebase-cli`
- **frontend rendering or UI wiring without backend workflow ownership** → relevant web/frontend skills
- **generic framework comparison before implementation** → `survey`
- **provider-specific low-abstraction integration** → the relevant provider/SDK skill

## High-value command patterns

### Install CLI / runtime packages
```bash
npm install -g genkit-cli
npm install genkit @genkit-ai/google-genai
```

### Start local development loop
```bash
genkit start -- npx tsx --watch src/index.ts
```

### Run a flow from the CLI
```bash
genkit flow:run myFlow '{"input":"value"}'
```

### Evaluate a flow
```bash
genkit eval:flow myFlow --input eval-inputs.json
```

## Troubleshooting
| Issue | What to check |
|---|---|
| Genkit feels heavy for the request | Re-check whether the work should live in `firebase-ai-logic` or direct SDK calls instead |
| Flow keeps changing shape | Freeze a smaller input/output contract before adding tools or retrieval |
| Tool calling keeps getting messy | Split deterministic actions from model reasoning and make tool boundaries explicit |
| RAG quality is weak | Inspect retrieval quality and prompt contract before adding more framework complexity |
| Team cannot tell where to deploy | Decide whether Firebase alignment or generic backend control is the real priority |
| Nobody trusts outputs yet | Add a small eval set and use traces/observability before widening rollout |

## Examples

### Example 1: Server-owned support assistant for a Firebase app
- Prompt: "We need a backend Genkit flow for our support app: retrieve help articles, call one ticket tool, and expose one endpoint the web app can reuse."
- Expected behavior: use `genkit`, choose `tool-and-agent` or `retrieval-and-prompt` mode, define the flow boundary, retrieval/tool plan, eval targets, and deployment shape.

### Example 2: Direct in-app Gemini feature
- Prompt: "Add Gemini-powered summaries directly inside our Firebase web app."
- Expected behavior: route away to `firebase-ai-logic` unless the request clearly adds server-owned orchestration requirements.

### Example 3: Existing Genkit app needs confidence before launch
- Prompt: "Our Genkit flows work locally, but we need a practical eval and observability plan before we deploy to Cloud Run."
- Expected behavior: use `genkit`, choose `evaluation-and-observability` mode, and produce an evidence-first quality plan.

### Example 4: Framework choice is still unclear
- Prompt: "Should we use Genkit, Firebase AI Logic, or just direct SDK calls for this Firebase app?"
- Expected behavior: route first to `survey`, then return to `genkit` only if the decision favors a backend workflow layer.

## Best practices
1. Choose Genkit because you need a **workflow layer**, not just because the app uses Firebase.
2. Start with one crisp flow contract before adding tools, RAG, or multi-agent behavior.
3. Keep direct app-side Gemini integration routed to `firebase-ai-logic`.
4. Use Developer UI / local traces early; they are part of Genkit's value.
5. Add evals when the workflow becomes a maintained product capability, not a one-off demo.
6. Treat deployment target choice as an architecture decision, not a copy-pasted default.
7. Prefer small reusable flows over one giant AI orchestration blob.

## References
- Firebase Genkit docs: https://firebase.google.com/docs/genkit
- Genkit docs: https://genkit.dev/docs/
- Genkit flows docs: https://genkit.dev/docs/js/flows/
- Genkit deployment docs: https://genkit.dev/docs/js/deployment/firebase/
- Firebase AI Logic docs: https://firebase.google.com/docs/ai-logic
