# Solution Landscape: genkit structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Genkit | Backend/server-owned AI workflow framework with flows, tools, evals, tracing, and deployment surfaces | Strong typed flow concept, Developer UI, eval/observability story, Firebase alignment, multi-provider support | Can be broader than needed for thin app features; overlap risk if client integration and platform ops are not routed out | Best fit for the existing `genkit` skill when the job is backend workflow ownership |
| Firebase AI Logic | Direct mobile/web app SDK lane for Gemini features in Firebase apps | Client/mobile/web SDKs, direct app integration, App Check/security framing, Firebase service alignment | Not the main fit for server-owned multi-step backend workflows | Clear route-out from `genkit` when the request is app/client-first |
| Firebase CLI | Platform/operator layer for Firebase project setup, emulators, deploys, and admin ops | Strong operator surface for bootstrap, emulators, hosting/functions deploy, admin tasks | Not a workflow/orchestration framework | Keep as an explicit route-out from `genkit` |
| Vercel AI SDK | TypeScript toolkit for AI-powered apps and agents across React/Next.js/Vue/Svelte/Node | Strong app/UI/server integration story, provider standardization, streaming/UI ergonomics | More app-delivery/UI oriented than the repo’s backend workflow boundary | Useful contrast to keep `genkit` from over-claiming frontend-heavy requests |
| LangChain / LangGraph | Broad framework for chains, agents, graphs, retrievers, and integrations | Large ecosystem, flexible orchestration patterns, deep retrieval/agent ecosystem | Easy to sprawl; broader than the repo’s narrow Genkit boundary | Good comparison target for `survey`, not a reason to widen `genkit` |
| LlamaIndex | Data / retrieval / RAG-oriented framework | Strong data-centric retrieval patterns and connectors | Often centered on data/RAG more than end-to-end app workflow ownership | Adjacent, especially for retrieval-heavy work |
| Temporal / Inngest / Trigger.dev | Durable workflow engines and retry/state substrates | Strong execution reliability, retries, long-running orchestration | Not AI-first; need another layer for prompts/tools/evals | Important fallback / complement when reliability is the real bottleneck |
| Plain provider SDKs + API routes | Minimal backend pattern using provider SDKs directly in route handlers or workers | Lowest overhead, fastest path for simple features | Ad hoc schemas, evals, observability, and reuse boundaries | Most common manual fallback; should be acknowledged inside `genkit` route-outs |

## Categories
### Backend AI workflow frameworks
- Genkit
- LangChain / LangGraph
- Mastra-style TS workflow frameworks (watchlist category)

### Direct app/client AI integration
- Firebase AI Logic
- Vercel AI SDK UI/app-led usage

### Retrieval/data-centric frameworks
- LlamaIndex
- LangChain retriever stacks

### Durable execution substrates
- Temporal
- Inngest
- Trigger.dev
- Queue/job systems

### Minimal manual patterns
- Plain provider SDK + route handler
- Cron/job workers
- Background queue consumers

## What People Actually Use
In practice, app teams do not choose between polished categories as cleanly as vendor pages suggest. Common real behavior is:
- direct SDKs or simple route handlers for synchronous features
- Genkit when the team wants reusable server-owned flows, tool boundaries, Developer UI traces, and deployment surfaces
- Firebase AI Logic when the request is clearly app/mobile/web SDK integration
- workflow engines / queues when durability matters more than AI abstraction
- `survey` or architecture review when the real decision is still “which layer should own this feature?”

## Frequency Ranking
1. Plain provider SDKs + backend routes
2. LangChain / LangGraph
3. Vercel AI SDK
4. Genkit
5. Firebase AI Logic
6. Temporal / Inngest / Trigger.dev
7. LlamaIndex

## Key Gaps
- The repo does not need another Firebase/AI wrapper; it needs a sharper `genkit` front door.
- The biggest remaining gap is acknowledging the **fallback gradient**: direct SDKs, app/client SDKs, durable workflow substrates, and framework-comparison requests all compete with Genkit adoption.
- `genkit` should stay honest about when a plain backend route, `firebase-ai-logic`, `firebase-cli`, or `survey` is the better next stop.

## Contradictions
- Firebase branding creates overlap pressure even though Firebase AI Logic and Genkit solve different ownership layers.
- Both Genkit and Vercel AI SDK can run server-side, but Vercel AI SDK’s public framing is more app/UI/toolkit oriented while Genkit’s core docs emphasize workflows, flows, deployment, and observability.
- Durable workflow tools can appear competitive with Genkit, but they often solve a different problem: execution reliability instead of AI workflow modeling.

## Curated Sources
- https://genkit.dev/ (`browser-rendered primary page evidence`)
- https://genkit.dev/docs/js/flows/ (`browser-rendered primary page evidence`)
- https://genkit.dev/docs/client/ (`browser-rendered primary page evidence`)
- https://firebase.google.com/docs/ai-logic (`browser-rendered primary page evidence`)
- https://ai-sdk.dev/docs/introduction (`browser-rendered primary page evidence`)
- https://js.langchain.com/docs/introduction/ (`official docs reference; lane-B survey synthesis`)
- https://langchain-ai.github.io/langgraph/ (`official docs reference; lane-B survey synthesis`)
- https://docs.llamaindex.ai/ (`official docs reference; lane-B survey synthesis`)
- https://www.inngest.com/docs (`official docs reference; lane-D survey synthesis`)
- https://docs.temporal.io/ (`official docs reference; lane-D survey synthesis`)

## Key Insight
The best bounded move is **not** to add another Firebase AI skill or turn `genkit` into a universal AI app framework explainer. The best move is to tighten `genkit` around one honest contract: server-owned AI workflows with explicit route-outs to app/client SDK work, Firebase platform ops, framework-comparison surveys, and reliability substrates when orchestration durability is the real problem.
