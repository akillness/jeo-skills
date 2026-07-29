---
name: genkit
description: >
  Route Firebase AI feature work into either direct app/client Firebase AI Logic
  SDK integration or a server-owned Genkit workflow. Use when a web, mobile,
  backend, or full-stack feature needs model calls, typed outputs, reusable flows,
  tools, retrieval, prompt files, evals, observability, or deployment. Choose
  client-ai-logic, flow-foundation, tool-and-agent, retrieval-and-prompt,
  evaluation-and-observability, deployment-runtime, or comparison-or-fallback;
  route Firebase platform/operator work to `firebase-cli` and broad framework
  comparisons to `survey`.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Covers both direct Firebase AI Logic client SDK integration and server-owned
  Genkit workflow planning. Best for repository packets, app feature wiring,
  backend routes, flow/eval docs, Cloud Run plans, and launch-readiness reviews.
metadata:
  tags: genkit, firebase, ai-workflows, flows, tool-calling, rag, evaluation, observability, cloud-run, fullstack, backend
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
  source: Firebase Genkit docs + Genkit official docs
  modernization: 2026-04-15
---

# Genkit

Use this skill when the main question is **"should this Firebase AI feature be a direct client SDK integration or a reusable server-owned Genkit workflow?"**

The job is not to dump a long Genkit tutorial, CLI catalog, or Firebase product tour.
Frame the current packet, choose one ownership boundary and operating mode, then keep
Firebase platform operations and broad framework comparisons routed to adjacent skills.

Read [references/intake-packets-and-fallbacks.md](references/intake-packets-and-fallbacks.md) before handling mixed or ambiguous requests.
Read [references/modes-and-routing.md](references/modes-and-routing.md) before choosing a primary mode.
Read [references/deployment-and-runtime-boundaries.md](references/deployment-and-runtime-boundaries.md) when runtime choice is the real open question.
Read [references/evals-and-observability.md](references/evals-and-observability.md) when the workflow already exists and confidence is the bottleneck.

## When to use this skill
- A mobile or web app needs direct **Firebase AI Logic client SDK** integration, including model setup, structured output, streaming, App Check, or safe client/server boundaries
- A backend or full-stack feature needs a **reusable Genkit flow** instead of one-off provider calls scattered through route handlers
- The work needs typed contracts, tool calling, retrieval, prompt files, evaluation, tracing, or deployment under a server-owned boundary
- The request is explicitly about Firebase AI Logic, Genkit, or deciding between their client-owned and server-owned shapes
- An existing Firebase AI feature needs debugging, evaluation, observability, or launch-readiness review

## When not to use this skill
- **The main job is Firebase bootstrap, emulator usage, hosting/functions deploy, auth/login, or admin CLI work** → `firebase-cli`
- **The request is generic frontend streaming/rendering with no Firebase AI SDK or Genkit boundary** → relevant frontend/web skill
- **The real question is broad framework choice (`Genkit` vs `Vercel AI SDK` vs other frameworks)** → `survey`
- **A plain provider SDK or simple route handler is enough and Firebase/Genkit is not a requirement** → note the fallback and keep the answer lightweight

## Instructions

### Step 1: Frame the current packet
Record the smallest useful intake before recommending Genkit.

Capture:
- app shape: web | mobile | backend | fullstack | mixed | unknown
- ownership: client feature | backend capability | mixed | unknown
- packet: route handler | feature brief | architecture note | deployed flow | eval/trace complaint | deploy plan | none
- workflow need: simple generation | structured output | tools | retrieval | prompt files | evals | observability | deployment | unknown
- delivery pressure: single endpoint | multi-surface reuse | launch readiness | migration | reliability concern | unknown

Quick frame:
```markdown
App shape: fullstack
Ownership: backend capability
Packet: existing API route + support feature brief
Workflow need: retrieval + one ticket tool + evals later
Delivery pressure: reuse across web app and internal ops panel
```

### Step 2: Choose the intake packet first
Use [references/intake-packets-and-fallbacks.md](references/intake-packets-and-fallbacks.md).

Pick the packet the user actually has now:
- new backend capability packet
- existing route/handler packet
- deployed flow quality packet
- deployment/runtime packet
- comparison/fallback packet
- no usable packet yet

Output this step as:
```markdown
## Intake Packet
- Current packet:
- Why it is enough (or not enough):
- Missing context to collect next:
```

Rule: do not force a server-owned Genkit flow just because the app already uses Firebase.

### Step 3: Choose the ownership layer
Make the client-versus-server decision explicit before choosing a mode.

Choose **`client-ai-logic`** when the dominant need is:
- direct mobile/web Firebase AI Logic SDK usage
- client streaming or structured output with a small app-owned feature boundary
- App Check, client-visible model configuration, or client/server data-exposure rules

Choose a **server-owned Genkit mode** when the dominant need is:
- a reusable backend AI contract or typed flow boundary
- one place to own tools, retrieval, prompts, evaluation, or tracing
- a capability shared across clients, jobs, or protected server-side resources

Do not force either layer when a plain provider SDK, ordinary route handler, or broader
framework survey is the better fit.

State the decision in one line:
```markdown
## Layer Decision
- Ownership: client-ai-logic | server-genkit | plain-sdk-fallback | survey-first
- Why:
```

### Step 4: Choose one primary operating mode
Pick one primary mode from [references/modes-and-routing.md](references/modes-and-routing.md).

Primary modes:
- `client-ai-logic`
- `flow-foundation`
- `tool-and-agent`
- `retrieval-and-prompt`
- `evaluation-and-observability`
- `deployment-runtime`
- `comparison-or-fallback`

Rule: one primary mode, optional secondary mode.
Do not mix client SDK wiring, backend flow design, deployment ops, and architecture comparison into one blob.

### Step 5: Freeze the smallest feature boundary
For `client-ai-logic`, define:
- one app feature and model interaction
- input/output or streaming contract
- client-visible versus server-only data and configuration
- App Check/auth/error handling and abuse boundaries

For a server-owned Genkit mode, define:
- one named backend capability and typed flow contract
- what must remain server-side
- tools/retrieval/prompts, if any
- which clients or jobs call it

Avoid mega-flows, exposing server secrets to clients, or adding tools/retrieval before one basic path works.

### Step 6: Name the fallback or route-out honestly
Use [references/intake-packets-and-fallbacks.md](references/intake-packets-and-fallbacks.md).

Common route-outs:
- Firebase CLI / emulator / deploy / admin work → `firebase-cli`
- generic frontend rendering with no Firebase AI SDK boundary → relevant frontend/web skill
- broad framework comparison or architecture uncertainty → `survey`
- thin non-Firebase model call → plain provider SDK / route-handler fallback
- durability, retries, or background orchestration dominating the problem → queue/job/workflow substrate

### Step 7: Pick the smallest next slice
Do not jump to a giant system diagram. Return one slice:
- wire one client SDK generation/streaming path with validation and abuse boundaries
- define or wrap one server flow contract
- add one tool or retrieval boundary
- add one representative eval set
- choose one runtime/deploy shape

### Step 8: Use evals and traces when confidence is the bottleneck
Use [references/evals-and-observability.md](references/evals-and-observability.md).

When the workflow already exists, prefer:
1. representative inputs
2. local trace review / Developer UI inspection
3. small eval set
4. contract / prompt / tool cleanup
5. rollout only after the evidence loop is good enough

### Step 9: Return the Firebase AI implementation brief
```markdown
# Firebase AI Implementation Brief

## Scope
- App shape:
- Ownership: client-ai-logic | server-genkit | fallback
- Intake packet:
- Primary mode:
- Confidence:

## Layer Decision
- Why this ownership fits:

## Feature Boundary
- Capability:
- Input / output or streaming contract:
- Client-visible / server-only responsibilities:
- Tools / retrieval / prompt-file needs:
- Auth, App Check, errors, and abuse boundaries:

## Smallest Next Slice
1. ...
2. ...
3. ...

## Route-outs / Fallbacks
- ...
```

## Examples

### Example 1: Reusable backend support workflow
**Input:** “Build a Genkit backend flow for our support app: retrieve help articles, call one ticket tool, and expose one server endpoint the web app can reuse.”

**Expected shape:** `tool-and-agent` or `retrieval-and-prompt`, explicit server-owned flow boundary, and one tool/retrieval plan.

### Example 2: Direct Firebase app feature
**Input:** “Add Gemini-powered summaries directly inside our Firebase web app with the Firebase SDK.”

**Expected shape:** `client-ai-logic`, with an app-owned SDK boundary, structured output or streaming contract, App Check/auth, and no unnecessary server flow.

### Example 3: Existing flow needs confidence before launch
**Input:** “Our Genkit flows work locally, but we need a practical eval and observability plan before deploying to Cloud Run.”

**Expected shape:** `evaluation-and-observability`, small evidence loop, and runtime specifics kept separate from Firebase CLI operations.

### Example 4: Framework choice is still unclear
**Input:** “Should we use Genkit, Firebase AI Logic, Vercel AI SDK, or just direct SDK calls for this Firebase app?”

**Expected shape:** `comparison-or-fallback`, route broad framework selection to `survey`, then return here with either `client-ai-logic` or a server-owned Genkit mode.

## Best practices
1. Choose the client or server ownership boundary before naming tools or models.
2. Prefer one crisp feature/flow boundary over a giant AI feature bucket.
3. Keep secrets and protected resources server-side; define App Check/auth and abuse boundaries for direct client work.
4. Acknowledge plain route-handler / provider-SDK fallbacks when they are enough.
5. Treat runtime choice as an architecture decision, not proof that Genkit is mandatory.
6. Use traces and evals before widening rollout.
7. Sync compact discovery surfaces whenever the front-door boundary changes.

## References
- Firebase Genkit docs: https://firebase.google.com/docs/genkit
- Genkit docs: https://genkit.dev/docs/
- Genkit flows docs: https://genkit.dev/docs/js/flows/
- Genkit client access docs: https://genkit.dev/docs/client/
- Firebase AI Logic docs: https://firebase.google.com/docs/ai-logic
- Firebase AI Logic web SDK docs: https://firebase.google.com/docs/ai-logic/get-started?api=web
- `../firebase-cli/SKILL.md`
- `../survey/SKILL.md`
- `../survey/SKILL.md`
