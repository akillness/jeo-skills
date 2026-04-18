# Genkit intake packets and fallbacks

## Pick the packet the user already has

### 1. New backend capability packet
Use when the user has a feature brief, product request, or API idea and wants one reusable server-owned AI capability.

Good signs:
- one backend responsibility is emerging
- multiple clients or internal tools may call the same capability
- typed input/output and ownership matter

Next move:
- choose `flow-foundation`, `tool-and-agent`, or `retrieval-and-prompt`
- define one smallest flow contract

### 2. Existing route/handler packet
Use when the team already has a Next.js / Express / Fastify / server route and wonders whether to wrap it in Genkit.

Good signs:
- prompt logic is duplicated across handlers
- tool/retrieval steps are starting to sprawl
- observability/evals are hard because there is no clear workflow boundary

Next move:
- decide whether the route should stay a plain handler or become one named flow
- only promote to Genkit if reuse, tracing, or workflow structure materially matters

### 3. Deployed flow quality packet
Use when Genkit already exists and the pain is confidence, not initial setup.

Good signs:
- traces exist but nobody trusts the workflow
- structured outputs are flaky
- prompt/tool/retrieval regressions are reaching production

Next move:
- choose `evaluation-and-observability`
- define representative inputs and the smallest eval loop

### 4. Deployment/runtime packet
Use when the flow exists and the main uncertainty is Firebase vs Cloud Run vs another service boundary.

Good signs:
- the feature already works locally
- rollout, auth, secret ownership, or client access is the real question
- the team is asking where the workflow should live in production

Next move:
- choose `deployment-runtime`
- decide owner, callers, and server-only responsibilities before naming commands

### 5. Comparison/fallback packet
Use when the user is still deciding whether Genkit should exist at all.

Good signs:
- “Genkit or Firebase AI Logic?”
- “Genkit or direct SDK calls?”
- “Should this just be a route handler / queue worker / Vercel AI SDK feature?”

Next move:
- choose `comparison-or-fallback`
- route to `survey` if a real architecture comparison is needed
- keep a plain-SDK fallback visible if the capability is too small for Genkit

## Fallback gradient
Treat these as legitimate alternatives, not failures:

1. **Direct Firebase app/client integration**
   - Best fit: `firebase-ai-logic`
   - Use when the job is in-app/mobile/web SDK usage, App Check-aware clients, or direct Gemini features in the product surface.

2. **Plain provider SDK + route handler**
   - Best fit when one synchronous backend capability is small, isolated, and unlikely to need reusable flow structure yet.
   - Mention this fallback when Genkit would be more framework than benefit.

3. **Queue/job/durable workflow substrate**
   - Best fit when retries, background execution, or long-running orchestration dominate the problem.
   - Genkit can complement this, but it should not hide the fact that durability may be the first design choice.

4. **Framework comparison**
   - Best fit: `survey`
   - Use when the user has not yet chosen between Genkit, Firebase AI Logic, Vercel AI SDK, LangChain, or direct SDKs.

5. **Firebase platform operations**
   - Best fit: `firebase-cli`
   - Use when the work is mostly bootstrap, emulators, deploys, auth/login, or admin operations.

## Short decision prompts
Ask these internally before choosing Genkit:
1. Is the capability server-owned, or is it really an app/client feature?
2. Will more than one route/client/job reuse this logic?
3. Are traces, evals, typed contracts, or tool/retrieval boundaries important enough to justify a framework layer?
4. Would a plain route handler or queue worker solve the problem with less overhead?
5. Is the user actually asking for a framework comparison instead of an implementation brief?
