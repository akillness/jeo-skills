---
name: genkit
description: >
  Route server-owned AI workflow work into one Genkit implementation brief.
  Use when the main job is deciding whether a web/backend/fullstack feature needs
  reusable flows, tools, retrieval, prompt files, typed contracts, evals,
  observability, or deployment across Firebase / Cloud Run / another backend
  runtime. Choose among flow-foundation, tool-and-agent, retrieval-and-prompt,
  evaluation-and-observability, and deployment-runtime modes; keep direct
  Firebase app/client SDK integration routed to `firebase-ai-logic`, Firebase
  platform/operator work routed to `firebase-cli`, and framework-choice
  comparisons routed to `survey`.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for repository packets, backend route handlers, API/service notes,
  Firebase app backends, Cloud Run service plans, flow/eval docs, and launch
  readiness reviews where the real decision is whether Genkit should own a
  server-side capability or the work belongs to a neighboring skill or simpler
  fallback.
metadata:
  tags: genkit, firebase, ai-workflows, flows, tool-calling, rag, evaluation, observability, cloud-run, fullstack, backend
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
  source: Firebase Genkit docs + Genkit official docs
  modernization: 2026-04-15
---

# Genkit

Use this skill when the main question is **"should this feature become a reusable server-owned AI workflow, and if so what is the smallest Genkit shape worth owning?"**

The job is not to dump a long Genkit tutorial, CLI catalog, or Firebase product tour.
The job is to frame the current packet, choose one operating mode, define one backend flow boundary, decide whether Genkit is actually the right layer, and route adjacent work away before the skill turns into app SDK wiring, Firebase ops, or generic framework comparison.

Read [references/intake-packets-and-fallbacks.md](references/intake-packets-and-fallbacks.md) before handling mixed or ambiguous requests.
Read [references/modes-and-routing.md](references/modes-and-routing.md) before choosing a primary mode.
Read [references/deployment-and-runtime-boundaries.md](references/deployment-and-runtime-boundaries.md) when runtime choice is the real open question.
Read [references/evals-and-observability.md](references/evals-and-observability.md) when the workflow already exists and confidence is the bottleneck.

## When to use this skill
- A backend or full-stack feature needs a **reusable AI flow** instead of one-off provider calls scattered through route handlers
- The work needs **typed input/output contracts**, flow ownership, or one AI capability reused across multiple clients, jobs, or surfaces
- The workflow needs **tool calling, retrieval, prompt files, structured outputs, evaluation, or local tracing** under a server-owned boundary
- The request is clearly about **Genkit** or **server-side Firebase AI workflow design**, not direct app/client SDK integration
- The open question is how to structure, debug, evaluate, or deploy an existing Genkit flow to Firebase, Cloud Run, or another backend runtime

## When not to use this skill
- **The main job is direct mobile/web app integration with Firebase AI Logic client SDKs** → `firebase-ai-logic`
- **The main job is Firebase bootstrap, emulator usage, hosting/functions deploy, auth/login, or admin CLI work** → `firebase-cli`
- **The request is mostly frontend streaming/rendering/app wiring without backend workflow ownership** → relevant frontend/web skill
- **The real question is framework choice (`Genkit` vs `Firebase AI Logic` vs `Vercel AI SDK` vs direct SDKs)** → `survey`
- **A plain provider SDK or simple route handler is probably enough and the user is not asking for reusable workflow structure** → note the fallback and keep the answer lightweight

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

Rule: do not force Genkit just because the app already uses Firebase.

### Step 3: Decide whether Genkit is the right layer
Make the ownership decision explicit before choosing a mode.

Choose **Genkit** when the dominant need is:
- a reusable server-side AI contract
- typed flow input/output boundaries
- one place to own tool/retrieval/prompt orchestration
- evaluation, tracing, or deployment support for a maintained backend feature

Do **not** force Genkit when the request is mainly:
- direct client/mobile/web SDK usage
- a thin one-off model call that can stay in a normal backend route
- a generic framework comparison with no chosen ownership layer yet
- a reliability/durability question better owned by queue/job/workflow infrastructure

State the decision in one line:
```markdown
## Layer Decision
- Use Genkit: yes | no | maybe-after-survey
- Why:
```

### Step 4: Choose one primary operating mode
Pick one primary mode from [references/modes-and-routing.md](references/modes-and-routing.md).

Primary modes:
- `flow-foundation`
- `tool-and-agent`
- `retrieval-and-prompt`
- `evaluation-and-observability`
- `deployment-runtime`
- `comparison-or-fallback`

Rule: one primary mode, optional secondary mode.
Do not mix backend flow design, frontend app wiring, deployment ops, and architecture comparison into one blob.

### Step 5: Freeze one smallest flow boundary
If Genkit is the right layer, define the smallest useful workflow contract:
- one named backend capability
- one input/output schema or contract
- what must remain server-side
- where tools/retrieval belong, if anywhere
- which client(s) or jobs call it

Good boundary examples:
- support reply + ticket action flow shared by web app and internal admin tools
- document-grounded answer flow with one retrieval source and schema-valid output
- existing flow that now needs eval coverage before a Cloud Run rollout

Bad boundary examples:
- every AI feature in one mega-flow
- client-side app integration disguised as a server workflow
- adding tools, retrieval, and multi-agent logic before one basic flow works

### Step 6: Name the fallback or route-out honestly
Use [references/intake-packets-and-fallbacks.md](references/intake-packets-and-fallbacks.md).

Common route-outs:
- direct Firebase app/client SDK integration → `firebase-ai-logic`
- Firebase CLI / emulator / deploy / admin work → `firebase-cli`
- frontend streaming/rendering/app wiring → relevant frontend/web skill
- framework comparison or architecture uncertainty → `survey`
- thin synchronous model call that can stay inside one existing route → note plain provider SDK / route-handler fallback instead of forcing Genkit
- durability / retries / background orchestration dominating the problem → note queue/job/workflow substrate as a complement or better first layer

### Step 7: Pick the smallest next slice
Do not jump to a giant system diagram.
Return the smallest next slice that makes Genkit real:
- define one flow contract
- wrap one existing route into a flow
- add one tool boundary
- add one retrieval boundary
- add one eval set with representative inputs
- choose one runtime/deploy shape

### Step 8: Use evals and traces when confidence is the bottleneck
Use [references/evals-and-observability.md](references/evals-and-observability.md).

When the workflow already exists, prefer:
1. representative inputs
2. local trace review / Developer UI inspection
3. small eval set
4. contract / prompt / tool cleanup
5. rollout only after the evidence loop is good enough

### Step 9: Return the Genkit brief
```markdown
# Genkit Brief

## Scope
- App shape:
- Ownership:
- Intake packet:
- Primary mode:
- Confidence:

## Layer Decision
- Use Genkit: yes | no | maybe-after-survey
- Why:

## Backend Flow Boundary
- Capability:
- Input / output contract:
- Server-only responsibilities:
- Tools / retrieval / prompt-file needs:

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

**Expected shape:** `tool-and-agent` or `retrieval-and-prompt`, explicit server-owned flow boundary, one tool/retrieval plan, no route to `firebase-ai-logic`.

### Example 2: Direct Firebase app feature
**Input:** “Add Gemini-powered summaries directly inside our Firebase web app with the Firebase SDK.”

**Expected shape:** route to `firebase-ai-logic` unless the request clearly adds a server-owned workflow requirement.

### Example 3: Existing flow needs confidence before launch
**Input:** “Our Genkit flows work locally, but we need a practical eval and observability plan before deploying to Cloud Run.”

**Expected shape:** `evaluation-and-observability`, small evidence loop, route runtime specifics through the deployment boundary without turning the answer into Firebase CLI ops.

### Example 4: Framework choice is still unclear
**Input:** “Should we use Genkit, Firebase AI Logic, Vercel AI SDK, or just direct SDK calls for this Firebase app?”

**Expected shape:** `comparison-or-fallback`, route to `survey`, and only return to `genkit` if the chosen ownership layer is a reusable backend workflow.

## Best practices
1. Choose Genkit because you need a **server-owned workflow layer**, not just because the product uses Firebase.
2. Start from the packet and ownership decision before naming tools or models.
3. Prefer one crisp flow boundary over a giant AI feature bucket.
4. Keep direct app/client SDK work routed to `firebase-ai-logic`.
5. Acknowledge plain route-handler / provider-SDK fallbacks when they are enough.
6. Treat runtime choice as an architecture decision, not proof that Genkit is mandatory.
7. Use traces and evals before widening rollout.
8. Sync compact discovery surfaces whenever the front-door boundary changes.

## References
- Firebase Genkit docs: https://firebase.google.com/docs/genkit
- Genkit docs: https://genkit.dev/docs/
- Genkit flows docs: https://genkit.dev/docs/js/flows/
- Genkit client access docs: https://genkit.dev/docs/client/
- Firebase AI Logic docs: https://firebase.google.com/docs/ai-logic
- `../firebase-ai-logic/SKILL.md`
- `../firebase-cli/SKILL.md`
- `../survey/SKILL.md`
