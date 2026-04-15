---
title: Firebase AI Workflow Cluster
created: 2026-04-15
updated: 2026-04-15
type: concept
tags: [skills, consolidation, trigger-design, skill-quality, survey]
sources: [.survey/genkit-firebase-ai-logic-modernization-20260415/context.md, .survey/genkit-firebase-ai-logic-modernization-20260415/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Firebase AI Workflow Cluster

## Durable finding
The Firebase AI lane should not be modeled as one generic "Firebase AI" bucket.

The durable boundary is:
- **`firebase-ai-logic`** = direct Firebase app/client SDK integration for Gemini-powered product features
- **`genkit`** = full-stack / backend workflow layer for server-owned flows, tools, retrieval, prompt files, evaluation, observability, and deployment
- **`firebase-cli`** = project/bootstrap/deploy/admin operations for Firebase itself

## Why this matters
Without this split, two bad outcomes recur:
1. `genkit` over-triggers on app-side SDK requests where a direct Firebase AI Logic workflow is simpler.
2. `firebase-ai-logic` under-specifies when the real need is backend orchestration, leading to stale or misleading routing for tool calling, RAG, evals, and long-lived server behavior.

## Maintenance direction
- Keep `genkit` as the canonical **server-owned workflow/orchestration anchor** in this lane.
- Keep `firebase-ai-logic` as the narrower **direct app integration** skill.
- Preserve support symmetry across the lane: both sides should carry `references/`, `evals/`, and clear `SKILL.toon` discovery wording so client-side requests do not drift back into backend-first answers.
- Do not merge them unless Firebase collapses the product boundary more aggressively in upstream docs.
- When future Firebase AI work lands, check whether it belongs to app integration, backend workflow orchestration, or Firebase project operations before adding or modernizing skills.

## Bridge questions for future runs
- Does a requested feature stay in the app layer, or does it need server ownership?
- Are tools, retrieval, evaluation, and traces first-class requirements or just optional future ideas?
- Is the request really a Firebase CLI/runtime question instead of an AI workflow question?

## Related pages
- [[skill-support-coverage]]
- [[developer-workflow-cluster]]
- [[backend-api-cluster]]
- [[genkit-modernization-2026-04-15]]
