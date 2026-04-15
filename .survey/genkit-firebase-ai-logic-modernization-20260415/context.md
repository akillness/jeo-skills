# Context: Genkit vs Firebase AI Logic modernization

## Workflow Context
Firebase now exposes two nearby but non-identical AI app paths that can look interchangeable in a skill catalog unless the boundary is made explicit.

1. **Firebase AI Logic** is the direct Firebase app-integration lane. The official docs position it around app SDK usage, model capabilities like text/chat/images/structured output/streaming, app-level controls like safety settings and system instructions, and production concerns like App Check, quotas, pricing, monitoring, and remote model changes. Browser-rendered primary page evidence: the Firebase AI Logic docs surface `Text`, `Chat`, `Structured output (JSON)`, `Streaming responses`, `Function calling`, `Model configuration`, `Safety settings`, `System instructions`, `Prevent API abuse with App Check`, `Rate limits & quota`, and `Monitor costs, usage, & metrics` in the core navigation. Source: https://firebase.google.com/docs/ai-logic
2. **Genkit** is the full-stack/server orchestration lane. The Genkit home page explicitly describes itself as **"The AI Framework for Full-Stack Apps"** and highlights unified model APIs, composable workflows, production-ready tools, local developer UI, and deployment to Firebase / Cloud Run / your own stack. The Genkit flows docs expose building blocks such as flows, tool calling, agentic patterns, Dotprompt, chat sessions, MCP, RAG, multi-agent systems, evaluation, local observability, web framework integrations, and deployment targets. Sources: https://genkit.dev/ and https://genkit.dev/docs/js/flows/

The practical decision is not "which one can call Gemini?" Both can live in Firebase-centered projects. The real decision is **where AI logic should live**:
- in the app/client integration layer for straightforward product features,
- or in a reusable backend workflow/orchestration layer for tools, retrieval, evaluation, and multi-surface reuse.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Firebase web/mobile developer | Add Gemini-powered UX features like chat, summarization, or multimodal generation inside an app | Intermediate |
| Fullstack AI app developer | Decide whether AI logic belongs in client SDK calls, API routes, Cloud Functions, or Cloud Run | Intermediate–advanced |
| Agent/operator building Firebase-backed AI products | Choose a maintainable workflow layer for tools, retrieval, evals, and long-lived AI behavior | Advanced |
| Repo/catalog maintainer | Prevent overlapping skill triggers and stale guidance in a fast-moving AI framework lane | Advanced |

## Current Workarounds
1. **Client-first + backend later** — teams start with direct Firebase AI Logic integration for UI speed, then move selected calls behind Functions/Cloud Run when privileged data, abuse prevention, or orchestration needs appear. Sources: https://firebase.google.com/docs/ai-logic and https://genkit.dev/docs/js/deployment/firebase/
2. **Thin backend wrapper instead of a full framework** — teams keep direct provider SDK calls or small endpoint wrappers rather than adopting Genkit immediately, especially when the app only needs one or two prompt pipelines.
3. **Thin Genkit wrapper around simple prompts** — teams standardize on Genkit even when the actual feature is still only a simple generation endpoint, which can add framework ceremony without much orchestration value.
4. **Ad hoc eval/logging** — teams rely on platform logs and manual prompt checks before they adopt Genkit-native evaluation or observability.

## Adjacent Problems
- **Privileged logic placement**: if the feature needs secrets, protected data, policy checks, or tool execution, client-only integration stops being sufficient.
- **Observability and evaluation**: Genkit has explicit primitives for evaluation and local observability; Firebase AI Logic surfaces app-side production controls but not the same orchestration-first workflow.
- **Reuse across surfaces**: a web-only feature can start in Firebase AI Logic, but reusable AI behavior across web, mobile, jobs, and internal tools pushes toward server-owned workflows.
- **Framework overhead vs simplicity**: Genkit solves more of the long-term workflow problem, but it is heavier than direct SDK integration for small app features.
- **Catalog ambiguity**: a weak skill description can make `genkit` and `firebase-ai-logic` trigger on the same request even though one should own orchestrated backend workflows and the other should own direct Firebase app integration.

## User Voices
> Confidence note: medium. The web search/extract APIs returned `401 Invalid API key` in this run, so the strongest evidence here comes from browser-rendered official docs and source-backed ecosystem synthesis rather than direct community-thread quotations.

- "If it's just an app-side Gemini feature, I don't want to stand up a flow server." Sources: Firebase AI Logic docs focus on direct app capabilities and production safeguards such as App Check and quota management: https://firebase.google.com/docs/ai-logic
- "Once I need tools, RAG, evaluation, or reusable backend logic, I want a workflow layer off the client." Sources: Genkit surfaces flows, tool calling, RAG, multi-agent systems, evaluation, observability, and deployment targets as first-class workflow concerns: https://genkit.dev/ and https://genkit.dev/docs/js/flows/
- "The confusion isn't model access — it's where the AI logic belongs." This is the main repo-maintenance finding from comparing the official surfaces: Firebase AI Logic reads like an app-integration layer; Genkit reads like a full-stack orchestration framework.
