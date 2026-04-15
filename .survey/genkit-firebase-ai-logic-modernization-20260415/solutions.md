# Solution Landscape: Genkit vs Firebase AI Logic modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Firebase AI Logic | Firebase-native app SDK integration for Gemini features | Lowest-friction Firebase app path; strong app-side capability surface; production controls like App Check, quotas, pricing, monitoring | Not a full workflow/orchestration framework; backend reuse/tooling/evals become separate decisions | Best for direct product features inside Firebase apps |
| Genkit | Full-stack AI framework with flows, tools, prompts, evals, observability, and deployment | Strong orchestration boundary; works across Firebase, Cloud Run, and broader stacks; unified model/provider layer | Heavier than direct SDK integration for simple features | Best for reusable backend AI workflows |
| Direct provider SDKs | Minimal direct integration with Gemini/OpenAI/Anthropic/etc. | Lowest abstraction, quickest access to provider features, easy thin wrappers | Repeated boilerplate; no shared orchestration/eval layer by default | Common fallback when teams avoid framework overhead |
| LangChain / LangGraph | General-purpose orchestration frameworks | Strong ecosystem for tools, agents, RAG, graph workflows | Not Firebase-native; larger abstraction surface; more cross-stack than Firebase-specific | Closest non-Google orchestration substitutes |
| Vercel AI SDK | Web-UX-centric AI SDK for TypeScript/React/Next.js | Strong streaming/UI ergonomics; good for app-layer AI UX | Not Firebase-native; weaker fit for Firebase-specific integration decisions | Alternative when the main problem is web UI DX |
| Firebase Studio | Firebase-centric prototyping/build environment | Useful surrounding workflow for app development | Not the same architectural layer as AI Logic or Genkit | Adjacent, not a direct replacement |

## Categories
- **Firebase-native app integration**: Firebase AI Logic
- **AI orchestration / backend workflow frameworks**: Genkit, LangChain, LangGraph
- **Low-abstraction direct access**: provider SDKs
- **Web UX AI SDK**: Vercel AI SDK
- **Firebase-centric build environment**: Firebase Studio

## What People Actually Use
The practical behavior pattern is usually one of three shapes:
1. **Direct SDK/app integration first** for chat, summarization, and multimodal UI features.
2. **Thin backend wrappers** in Functions/Cloud Run when sensitive data, tool use, or policy checks appear.
3. **Framework adoption later** when the AI feature becomes long-lived backend logic with flows, prompts, evaluations, and observability needs.

This matters for repo maintenance because a skill catalog that treats Genkit as just another SDK guide misses its real role as the durable orchestration option.

## Frequency Ranking
1. **Firebase AI Logic** — most likely when the problem statement is “add Gemini to my Firebase app”.
2. **Genkit** — most likely when the problem statement is “build a reusable AI workflow/service in a Firebase or fullstack app”.
3. **Direct provider SDKs** — the common no-framework fallback.
4. **LangChain / LangGraph** — common orchestration alternatives outside the Google-specific lane.
5. **Vercel AI SDK** — common when React/Next.js UI DX is the main driver.
6. **Firebase Studio** — adjacent environment choice, not the core runtime decision.

## Key Gaps
- The current repo does not clearly separate **direct Firebase app integration** from **workflow/orchestration ownership**.
- `genkit` lacks the support files/evals expected of a modern high-value anchor skill.
- `firebase-ai-logic` is stale enough to risk inaccurate guidance in a rapidly changing Firebase AI lane.
- Discovery docs currently undersell the difference between the two skills, which increases misfires and overlap.

## Contradictions
- **Marketed overlap vs actual workflow boundary**: both surfaces can be described as "Firebase AI", but the official docs emphasize different layers. Firebase AI Logic focuses on app features and production safeguards; Genkit focuses on flows, tools, devtools, evaluation, and deployment.
- **Simple-start promise vs long-term maintenance reality**: direct SDK integration is simpler at first, but teams often reintroduce backend orchestration once the product needs tools, retrieval, or reusable logic.

## Key Insight
The best bounded repo improvement is not deleting one of these skills or pretending they are direct substitutes. It is to make **Genkit the decision-first full-stack workflow/orchestration anchor** and keep **Firebase AI Logic** as the narrower direct Firebase app-integration skill. That improves trigger precision, reduces duplicate activation, and matches the structure exposed by the official product surfaces.
