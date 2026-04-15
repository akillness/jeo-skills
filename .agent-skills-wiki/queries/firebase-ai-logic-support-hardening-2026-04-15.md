---
title: Firebase AI Logic support hardening 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [survey, trigger-design, skill-quality, consolidation]
sources: [.survey/firebase-ai-logic-client-integration-modernization-20260415/triage.md, .survey/firebase-ai-logic-client-integration-modernization-20260415/context.md, .survey/firebase-ai-logic-client-integration-modernization-20260415/solutions.md, .agent-skills/firebase-ai-logic/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Firebase AI Logic support hardening 2026-04-15

## Question
After modernizing `genkit`, what is the best bounded follow-up for the client side of the Firebase AI lane: add another skill, merge the lane, or upgrade `firebase-ai-logic` itself?

## Answer
The best bounded follow-up is to **upgrade `firebase-ai-logic` itself** into a decision-first app/client integration anchor with support files and evals.

## Why this was the right ratchet
- Official Firebase AI Logic positioning keeps emphasizing direct mobile/web/app integration and client SDK usage.
- Official Genkit positioning keeps emphasizing flows, tools, retrieval, evaluation, observability, and deployment/runtime concerns.
- That means the lane was not missing a new concept; it was missing **support symmetry** on the client side.

## Accepted changes
- Rewrote `firebase-ai-logic` as a mode-selecting app/client integration skill.
- Added `references/modes-and-routing.md`, `references/production-controls.md`, and `references/feature-packets.md`.
- Added `evals/evals.json` and refreshed `SKILL.toon` plus manifest/discovery wording.
- Removed stale setup guidance that previously leaked low-signal commands and weak boundaries.

## Rejected changes
- Adding another Firebase AI wrapper skill
- Merging `firebase-ai-logic` and `genkit`
- Leaving the client-side half of the lane as a stale snippet dump while only the backend half had support artifacts

## Durable takeaway
In this repo, Firebase AI maintenance should preserve a balanced three-way split:
- app/client feature integration → `firebase-ai-logic`
- backend workflow orchestration → `genkit`
- Firebase project/deploy/operator work → `firebase-cli`

## Related pages
- [[firebase-ai-workflow-cluster]]
- [[skill-support-coverage]]
- [[genkit-modernization-2026-04-15]]
