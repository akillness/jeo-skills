---
title: Genkit modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [survey, trigger-design, skill-quality, consolidation]
sources: [.survey/genkit-firebase-ai-logic-modernization-20260415/triage.md, .survey/genkit-firebase-ai-logic-modernization-20260415/context.md, .survey/genkit-firebase-ai-logic-modernization-20260415/solutions.md, .agent-skills/genkit/SKILL.md, .agent-skills/firebase-ai-logic/SKILL.md]
---

# Genkit modernization 2026-04-15

## Question
What is the best bounded improvement for the Firebase/fullstack AI lane: add another skill, merge `genkit` and `firebase-ai-logic`, or modernize one skill and sharpen the boundary?

## Answer
The best bounded improvement is to **modernize `genkit` into the full-stack/backend AI workflow anchor** and sharpen its route-out to `firebase-ai-logic` for direct Firebase app/client SDK integration.

## Why keep both skills
- Official Firebase AI Logic surfaces app-level capabilities and production controls like App Check, quotas, monitoring, safety settings, and direct feature integration.
- Official Genkit surfaces flows, tool calling, prompt files, retrieval, evaluation, observability, and deployment/runtime concerns.
- The overlap is product ecosystem branding, not actual workflow ownership.

## Accepted changes
- Rewrote `genkit` as a decision-first workflow skill with explicit operating modes.
- Added `references/` docs and `evals/evals.json` to `genkit`.
- Sharpened `firebase-ai-logic` trigger wording so app-side SDK requests route there while server-owned workflow requests route to `genkit`.
- Updated discovery surfaces so the repo no longer advertises `genkit` as a generic example dump.

## Rejected changes
- Adding another overlapping Firebase AI wrapper skill
- Merging `genkit` and `firebase-ai-logic` into one bucket
- Leaving `genkit` as a long command/example catalog with no support artifacts

## Durable takeaway
In this repo, the Firebase AI lane should stay three-way separated:
- app integration → `firebase-ai-logic`
- workflow orchestration → `genkit`
- Firebase platform/project operations → `firebase-cli`

## Related pages
- [[firebase-ai-workflow-cluster]]
- [[skill-support-coverage]]
