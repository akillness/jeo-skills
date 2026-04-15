# Context: Firebase AI Logic client integration modernization

## Workflow Context
The Firebase AI lane now naturally splits into three operating surfaces:
1. **Direct app/client integration** for in-app text, chat, multimodal, structured output, and streaming via Firebase AI Logic client SDKs.
2. **Server-owned workflow orchestration** for flows, tool calling, retrieval, evaluation, observability, and deployment via Genkit.
3. **Firebase platform operations** for project setup, emulators, hosting, functions, and deploy mechanics via `firebase-cli`.

Official Firebase AI Logic docs position the product as a way to "build AI-powered mobile and web apps and features" and its getting-started guide is explicitly for the Firebase AI Logic **client SDKs**. The production checklist adds app-level controls like App Check, quota/rate-limit, and monitoring considerations. Meanwhile Genkit positions itself as "The AI Framework for Full-Stack Apps" with flows, devtools, deployment, and client-app integration helpers layered around server-side workflows.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend/mobile app engineer | Add Gemini-powered summaries, chat, multimodal prompts, and streaming directly inside app UX | Intermediate |
| Fullstack engineer | Decide whether a feature stays in the app/client layer or moves into a server-owned workflow | Intermediate–Advanced |
| Firebase product engineer | Launch AI features with App Check, quota, and production controls | Intermediate |
| Agent maintaining this repo | Route prompts to the right Firebase AI skill and keep the lane non-duplicative | Advanced |

## Current Workarounds
1. Use `firebase-ai-logic` only for trigger routing, then rely on ad hoc memory or external docs for the actual boundary with `genkit`.
2. Jump directly to `genkit` because it has support files, even for app-side Firebase SDK questions that do not need backend orchestration.
3. Treat Firebase app integration, server workflows, and Firebase CLI/project operations as one blended task packet, then untangle it manually.
4. Copy legacy code snippets without a reusable decision model for App Check, model placement, or route-outs.

## Adjacent Problems
- Weak client-side guidance makes the repo over-index on backend orchestration even when the user only needs in-app SDK integration.
- Missing `evals/` makes future regressions likely after the `genkit` rewrite.
- Missing `references/` makes it harder to preserve the distinction between app-side Firebase AI Logic, Genkit backend flows, and Firebase CLI operations.
- A stale install/example catalog can leak wrong package/setup guidance into downstream manifests and command extraction.

## User Voices
> "If you need to call the Gemini API directly from your mobile or web app — rather than server-side — you can use the Firebase AI Logic client SDKs."  
Source: DuckDuckGo HTML indexed snippet linking to the official Firebase AI Logic docs (`https://firebase.google.com/docs/ai-logic`) — confidence: high.

> "Firebase AI Logic client-side integrations enable a variety of rich AI-powered scenarios without needing a custom backend. Thousands of apps in production today use these client-side integrations..."  
Source: DuckDuckGo HTML indexed snippet linking to Firebase Blog "Building AI-powered apps with Firebase AI Logic" (`https://firebase.blog/posts/2025/05/building-ai-apps/`) — confidence: medium.

> "Learn how to get started with Genkit, including project setup, installing packages, configuring API keys, creating your first flow, and testing in the Developer UI."  
Source: direct page retrieval from `https://genkit.dev/docs/get-started` (title/meta).

## Sources
- browser-rendered primary page evidence: `https://firebase.google.com/docs/ai-logic`
- browser-rendered primary page evidence: `https://genkit.dev/`
- direct page retrieval (title/meta/snippet): `https://firebase.google.com/docs/ai-logic/get-started`
- direct page retrieval (title/meta/snippet): `https://firebase.google.com/docs/ai-logic/production-checklist`
- direct page retrieval (title/meta/snippet): `https://genkit.dev/docs/get-started`
- direct page retrieval (title/meta/snippet): `https://genkit.dev/docs/flows`
- direct page retrieval (title/meta/snippet): `https://genkit.dev/docs/devtools`
- GitHub raw primary-source retrieval: `https://raw.githubusercontent.com/firebase/genkit/main/README.md`
- DuckDuckGo HTML indexed snippet: Firebase AI Logic production checklist / overview / blog snippets
- DuckDuckGo HTML indexed snippet: Genkit deployment and onCallGenkit snippets
