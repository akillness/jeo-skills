# Context: genkit structural hardening

## Workflow Context
Genkit shows up most naturally when an app team needs **server-owned AI workflows** rather than direct client SDK usage. The official Genkit site positions it as an AI framework for full-stack apps with unified model APIs, composable workflows, developer tools, and deployment to Firebase, Cloud Run, or another stack. The flows docs go further: workflows usually need more than a model call, and Genkit flows add typed boundaries, Developer UI execution, deployment support, and observability hooks.

For this repo, the important workflow boundary is:
1. direct Firebase app/mobile/web Gemini integration → `firebase-ai-logic`
2. server-owned flows, tools, retrieval, evals, and deployment choices → `genkit`
3. Firebase project / CLI / emulator / deploy operations → `firebase-cli`
4. framework-choice comparison before committing → `survey`

That boundary is reinforced by current repo behavior: `firebase-cli` already routes backend AI workflow orchestration to `genkit`, and the current `genkit` skill already routes direct app SDK work to `firebase-ai-logic`. The remaining gap is that the `genkit` front door still spends too many lines on examples, commands, and troubleshooting that can live in support packets.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Full-stack app developer | Add reusable AI endpoints or flows behind web/mobile products | Intermediate |
| Firebase developer | Decide between direct Firebase AI Logic integration and backend Genkit orchestration | Intermediate |
| Backend/platform engineer | Own typed flow contracts, secrets, auth boundaries, runtime choice, and rollout shape | Intermediate–advanced |
| Product/feature team shipping AI | Reuse one AI capability across web, cron, jobs, and internal tools | Intermediate |
| Agent maintainer | Keep skill boundaries sharp across overlapping Firebase/AI skills | Advanced |

## Current Workarounds
1. **Plain API route + provider SDK** — teams often keep AI logic in a Next.js/Express/Fastify handler and skip an orchestration framework for simple synchronous features.
   - Limitation: flow boundaries, evals, and observability stay ad hoc.
2. **Genkit inside a normal server shell** — teams wrap Genkit flows with API routes, auth checks, request validation, and deployment glue outside the framework.
   - Limitation: the route layer vs flow layer split is easy to blur.
3. **Firebase AI Logic for app-side features** — teams use Firebase AI Logic when they need direct mobile/web SDK access, App Check-aware clients, and in-app Gemini features.
   - Limitation: it is not the same as a server-owned flow/orchestration layer.
4. **Alternative framework layer** — teams use Vercel AI SDK, LangChain/LangGraph, or LlamaIndex when they want UI-led app integration, larger orchestration ecosystems, or data-centric RAG flows.
   - Limitation: these alternatives solve different slices and can create overlap if the skill boundary is fuzzy.
5. **Jobs / queues / durable workflows** — teams fall back to cron, queues, Cloud Run jobs, Temporal, or Inngest when reliability is the real bottleneck.
   - Limitation: these are reliability substrates, not a direct replacement for Genkit’s AI workflow contract.

## Adjacent Problems
- Client vs server confusion: Firebase AI Logic and Genkit share ecosystem branding, but the docs separate direct app/mobile/web SDK usage from server-side workflow ownership.
- Runtime confusion: Firebase vs Cloud Run vs another backend is a deployment boundary decision, not proof that Genkit is or is not the right framework.
- Framework-choice ambiguity: many teams are really asking “Genkit vs Firebase AI Logic vs Vercel AI SDK vs direct SDKs,” which belongs in `survey` unless the backend-workflow decision is already clear.
- Reliability substrate confusion: teams sometimes need queues or durable execution more than an AI framework; Genkit should acknowledge that fallback gradient instead of pretending every backend AI job needs the same abstraction.
- Frontend streaming confusion: streaming UX and client rendering concerns can dominate the request even when the backend flow is small.

## User Voices
> “Build AI-powered mobile and web apps and features with the Gemini models using Firebase AI Logic.” — Firebase AI Logic intro (`browser-rendered primary page evidence`)

> “If you need to call the Gemini API directly from your mobile or web app — rather than server-side — you can use the Firebase AI Logic client SDKs.” — Firebase AI Logic intro (`browser-rendered primary page evidence`)

> “AI workflows typically require more than just a model call.” — Genkit flows docs (`browser-rendered primary page evidence`)

> “Just by wrapping your generate calls like this, you add some functionality: doing so lets you run the flow from the Genkit CLI and from the developer UI, and is a requirement for several of Genkit’s features, including deployment and observability.” — Genkit flows docs (`browser-rendered primary page evidence`)

## Sources
- https://genkit.dev/ — Genkit homepage (`browser-rendered primary page evidence`)
- https://genkit.dev/docs/js/flows/ — Genkit flows docs (`browser-rendered primary page evidence`)
- https://genkit.dev/docs/client/ — Genkit client access docs (`browser-rendered primary page evidence`)
- https://firebase.google.com/docs/ai-logic — Firebase AI Logic intro (`browser-rendered primary page evidence`)
- https://ai-sdk.dev/docs/introduction — Vercel AI SDK intro (`browser-rendered primary page evidence`)
- https://github.com/firebase/genkit — upstream Genkit repo (`repo/discussion surface`)
- `.agent-skills/genkit/SKILL.md`
- `.agent-skills/firebase-ai-logic/SKILL.md`
- `.agent-skills/firebase-cli/SKILL.md`
