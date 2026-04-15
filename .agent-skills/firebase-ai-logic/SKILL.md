---
name: firebase-ai-logic
description: >
  Integrate Firebase AI Logic as the direct Firebase app/client SDK lane for
  Gemini-powered features. Use when the user needs in-app text/chat/multimodal
  generation, structured output, streaming, or App Check-aware Firebase app
  integration without a separate workflow framework. Triggers on: Firebase AI
  Logic, Gemini in Firebase app, Firebase AI SDK, client-side Gemini, in-app AI
  feature, mobile/web AI integration, and direct Firebase model integration.
  Route server-owned flows, tool calling, RAG, evaluation, and reusable backend
  orchestration to `genkit`, and route project/deploy/operator tasks to
  `firebase-cli`.
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  tags: firebase, ai, gemini, app-integration, mobile, web, client-sdk
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
---

# Firebase AI Logic

## When to use this skill
- Add **Gemini-powered features directly inside a Firebase app**.
- Build **in-app text, chat, multimodal, structured-output, or streaming** experiences.
- Decide whether a request should stay in the **client/app layer** or move to a backend workflow.
- Add **Firebase-specific production controls** such as App Check, quota awareness, and Firebase service integration around the AI feature.
- Handle app-side AI for web, mobile, Flutter, Unity, or similar Firebase-supported client surfaces.

## Do not use this skill when
- The user needs **server-owned flows, tool calling, RAG, evaluators, traces, prompt files, or reusable backend orchestration** → use `genkit`.
- The user needs **Firebase project setup, emulator, hosting/functions deploys, or CLI operations** → use `firebase-cli`.
- The user is not committed to Firebase and mainly needs a generic provider SDK comparison → use a provider-specific or framework-selection skill instead.

## Operating model
Treat `firebase-ai-logic` as the **client/app integration anchor** in a three-way lane:
1. **App/client feature integration** → `firebase-ai-logic`
2. **Backend workflow orchestration** → `genkit`
3. **Firebase platform / operator tasks** → `firebase-cli`

Do not blur these roles. If the request spans more than one role, split the packet and route each part explicitly.

## Instructions

### Step 1: Classify the request before giving implementation advice
Choose one mode first.

#### Mode A — Direct feature fit
Use this when the user wants to add an in-app AI feature such as:
- chat or assistant UI
- summarization or rewriting in the app
- multimodal prompts from user content
- structured output for app workflows
- streaming model responses into the UI

Deliver:
- whether Firebase AI Logic is the right lane
- what belongs in the app layer vs what should move out
- the minimum Firebase dependencies/services involved

#### Mode B — App wiring and UX integration
Use this when the user already chose Firebase AI Logic and needs help wiring it into the app.

Focus on:
- where the model call lives in the app architecture
- request/response lifecycle in UI state
- loading/error/retry/fallback UX
- prompt/template ownership in the app
- content moderation / safety surface the app must expose

#### Mode C — Production hardening
Use this when the feature exists or is close to launch.

Focus on:
- App Check / abuse prevention
- quota, cost, and rate-limit implications
- monitoring and failure visibility
- remote rollout / feature-flag strategy if relevant
- privacy boundaries for user input and generated output

#### Mode D — Escalation boundary
Use this when the user started with a client-side request, but the shape now implies backend orchestration.

Escalate to `genkit` when you see:
- tool calling or agent loops
- retrieval / RAG / database-grounded generation
- reusable flows shared across platforms
- evaluation harnesses, traces, or systematic observability
- secrets or privileged APIs that should not sit in the client

### Step 2: Normalize the request packet
Rewrite the request into this brief before answering:

```markdown
## Firebase AI Logic packet
- App surface: web | iOS | Android | Flutter | Unity | mixed
- User-facing feature: chat | summary | generation | multimodal | structured output | streaming
- Data involved: user text | images | docs | app state | Firebase data
- Safety/privacy concern: none | moderate | high
- Production stage: prototype | internal beta | launch prep | live issue
- Boundary check: stays in app | split with backend | move to `genkit`
```

If the packet says `split with backend` or `move to genkit`, say so immediately instead of pretending one skill owns the entire solution.

### Step 3: Give app-layer guidance, not a giant code dump
For Firebase AI Logic requests, structure the answer in this order:
1. **Why this should stay in the app layer**
2. **What to wire in the client UI/runtime**
3. **What Firebase-specific controls matter**
4. **What not to put in the client**
5. **When to escalate to `genkit` or `firebase-cli`**

Use short code or pseudo-structure only when it clarifies the integration. Prefer architecture and boundary guidance over long SDK snippets.

### Step 4: Cover the Firebase-specific concerns
Always touch the concerns that make this lane distinct from raw provider SDK usage:
- App Check / abuse prevention when relevant
- quotas / cost / rate awareness
- Firebase service interplay (Auth, Remote Config, analytics/monitoring, storage, functions handoff if needed)
- platform support implications for the target app surface
- rollout strategy for model changes or feature exposure when the request is production-facing

### Step 5: Enforce honest route-outs
Use these route-outs explicitly.

| If the user needs... | Route to... |
|---|---|
| server-owned flows or tool calling | `genkit` |
| retrieval / RAG / evals / traces | `genkit` |
| deploys, emulators, hosting, or functions ops | `firebase-cli` |
| non-Firebase provider choice | provider/framework skill |

### Step 6: Output format
Respond with a compact packet like this:

```markdown
## Recommendation
- Lane: Firebase AI Logic | Split with Genkit | Not a Firebase AI Logic fit
- Why: ...

## App-layer plan
1. ...
2. ...
3. ...

## Firebase-specific controls
- App Check / abuse:
- Quota / cost:
- Monitoring / rollout:

## Route-outs
- `genkit`: ...
- `firebase-cli`: ...
```

## Best practices
1. Keep **simple user-facing AI** in the app layer only while it remains low-privilege and low-orchestration.
2. Move backend-worthy behavior out early; do not bolt tools/RAG/evals onto a client-only design.
3. Treat App Check, quota, and launch-readiness as first-class concerns, not afterthoughts.
4. Prefer one clear feature packet per response instead of mixing app UX, backend orchestration, and Firebase ops into a single blob.
5. When uncertain, explain the split between app-side Firebase AI Logic and backend-side `genkit` before proposing implementation steps.

## Examples

### Example 1: Should stay in Firebase AI Logic
**Input:** "Add streaming Gemini summaries inside our Firebase web app for article previews."

**Output shape:**
- lane = Firebase AI Logic
- plan focuses on app UI state, streaming rendering, prompt ownership, failure states, and App Check/quota guardrails
- route-out notes that reusable summarization pipelines or evaluation harnesses belong in `genkit`

### Example 2: Should split with Genkit
**Input:** "Our mobile app needs chat, tool calling, and retrieval over Firebase data with server-side observability."

**Output shape:**
- lane = Split with Genkit
- Firebase AI Logic stays at the app interaction edge only if needed
- backend workflow, retrieval, tools, and observability move to `genkit`

## References
- [Firebase AI Logic overview](https://firebase.google.com/docs/ai-logic)
- [Firebase AI Logic get started](https://firebase.google.com/docs/ai-logic/get-started)
- [Firebase AI Logic production checklist](https://firebase.google.com/docs/ai-logic/production-checklist)
- [Genkit docs](https://genkit.dev/docs/get-started)
