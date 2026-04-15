# Firebase AI Logic modes and routing

## Core boundary
Use `firebase-ai-logic` when the job is primarily **direct app/client SDK integration** for Gemini-powered features inside a Firebase app.

Keep the lane split three ways:
- `firebase-ai-logic` — app/client feature integration
- `genkit` — server-owned workflows, tools, retrieval, evals, observability
- `firebase-cli` — project, emulator, deploy, and operator tasks

## Modes

### 1. Direct feature fit
Use when the user asks for in-app chat, summaries, structured output, multimodal prompts, or streaming.

### 2. App wiring and UX integration
Use when the user needs to decide where requests live in the app, how UI state handles streaming/loading/errors, and how prompt ownership fits the product.

### 3. Production hardening
Use when the user is preparing to ship and needs App Check, quota/cost awareness, rollout control, and monitoring.

### 4. Escalation boundary
Use when the original app-side request now includes tools, retrieval, shared backend logic, evaluations, traces, or privileged APIs. At that point, route the orchestration layer to `genkit`.

## Fast routing checklist
- **Stays here:** direct app feature, low-privilege model call, UI streaming, structured output in app workflow
- **Move to `genkit`:** tools, RAG, reusable flows, evals, backend observability, secret-bearing integrations
- **Move to `firebase-cli`:** project bootstrapping, emulator work, deploy/config changes

## Anti-patterns
- Treating Firebase AI Logic as the owner of backend agents or tool orchestration
- Using `genkit` by default for every Firebase AI request, even when the user only wants an in-app feature
- Mixing deploy/operator instructions into an app-integration answer
