# Solution Landscape: Firebase AI Logic client integration modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Firebase AI Logic | Direct Firebase app/client SDK integration | Explicit mobile/web/client framing, structured output + streaming + function-calling surfaces, App Check + quota + monitoring guidance | Easy to confuse with backend orchestration if the repo skill body is still a generic example dump | Best fit for in-app Gemini features without a separate workflow framework |
| Genkit | Server-side/full-stack AI workflow framework | Flows, tool calling, retrieval, evaluation, observability, deployment to Firebase/Cloud Run/other runtimes, strong developer tooling | Too broad for simple in-app Firebase SDK work; can swallow app-side requests if boundary language is weak | Best fit for reusable backend orchestration |
| Firebase Functions `onCallGenkit` | Bridge layer from app to Genkit flows | Gives a clean callable boundary from client apps into server-owned flows | Adds backend infrastructure and auth/runtime consequences; unnecessary for simple direct app-side features | Useful handoff target when Firebase AI Logic requests need tools/RAG/server-side controls |
| Direct provider SDKs | Use provider SDKs without Firebase AI Logic or Genkit | Maximum raw control; works outside Firebase ecosystem | Loses Firebase-specific App Check / platform integrations and consistent lane boundaries in this repo | Route out only when Firebase is not the right substrate |
| Firebase CLI | Project/deploy/operator surface | Owns project setup, emulator, hosting/functions deploy, extensions, and Firebase platform commands | Not the right home for model interaction guidance | Remains the operational lane, not the app/runtime lane |

## Categories
- **Client SDK / app integration:** Firebase AI Logic
- **Server workflow orchestration:** Genkit
- **App-to-server bridge:** `onCallGenkit` / callable Genkit flows
- **Platform operations:** Firebase CLI
- **Non-Firebase escape hatch:** direct provider SDKs

## What People Actually Use
- For app-side Firebase features, official Firebase AI Logic messaging keeps emphasizing mobile/web/client SDK usage and production controls like App Check, quotas, and monitoring.
- For reusable server-owned logic, official Genkit docs and README emphasize flows, tool calling, evaluation, devtools, deployment, and backend observability.
- In practice, teams often keep both: direct app-side Firebase SDK use for simple UX features, then bridge into Genkit via callable/server endpoints when tool use or reusable backend workflows appear.

## Frequency Ranking
1. **Firebase AI Logic** — most frequently presented as the direct mobile/web/app SDK path in Firebase docs and indexed snippets.
2. **Genkit** — most frequently presented as the workflow/deployment/evaluation framework in official docs and raw README.
3. **onCallGenkit / Firebase Functions bridge** — recurring secondary pattern for connecting app clients to Genkit-managed workflows.
4. **Firebase CLI** — frequent, but purely operational rather than workflow ownership.
5. **Direct provider SDKs** — fallback/alternative rather than the repo’s preferred Firebase lane.

## Key Gaps
- The repo currently has a strong backend/workflow skill (`genkit` in PR #66) but a weak client-side counterpart (`firebase-ai-logic`) with no support files or eval harness.
- The client-side skill still carries stale example/setup guidance, so derived manifests can inherit incorrect or low-signal commands.
- Without references/evals, the clean three-way Firebase lane boundary is easy to regress.

## Contradictions
- Marketed language can make both tools look like general-purpose Firebase AI solutions, but the workflow evidence is not symmetric: Firebase AI Logic is framed around **direct app/client integration**, while Genkit is framed around **flows + tools + evals + deployment**.
- Genkit marketing includes client integration helpers, but its core docs and README still center server-side deployment and workflow primitives; treating it as the default answer for all Firebase AI questions would overreach.

## Key Insight
The highest-value bounded follow-up is not another Firebase AI wrapper and not a merge. It is to modernize `firebase-ai-logic` into a workflow-first **client/app integration anchor** with explicit route-outs to `genkit` and `firebase-cli`, plus support files and evals that preserve the client-vs-backend-vs-ops boundary over time.
