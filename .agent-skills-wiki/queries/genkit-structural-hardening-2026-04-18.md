---
title: genkit structural hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, consolidation, graphify, docs]
sources: [.survey/genkit-structural-hardening-20260418/triage.md, .survey/genkit-structural-hardening-20260418/context.md, .survey/genkit-structural-hardening-20260418/solutions.md, .agent-skills/genkit/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# genkit structural hardening 2026-04-18

## Question
What is the best bounded next improvement for `genkit` after the 2026-04-15 modernization pass?

## Answer
Tighten `genkit` into a **packet-first backend workflow anchor** that chooses whether the current request should become a reusable Genkit flow at all, keeps plain SDK / route-handler fallbacks visible for thin backend features, routes framework-choice ambiguity to `survey`, and preserves the existing Firebase lane split with `firebase-ai-logic` and `firebase-cli`.

## Accepted changes
- Rewrote `genkit/SKILL.md` around packet framing, layer decision, one primary mode, one smallest flow boundary, and explicit fallback/route-out handling.
- Added `references/intake-packets-and-fallbacks.md` and updated `references/modes-and-routing.md`.
- Expanded `evals/evals.json` with a thin-route fallback case.
- Synced `SKILL.toon`, `skills.toon`, `skills.json`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so compact and discovery surfaces match the tighter boundary.
- Refreshed `graphify-out/` and recorded the Firebase lane fallback gradient in the wiki.

## Rejected changes
- Adding another Firebase/AI wrapper skill.
- Merging `genkit`, `firebase-ai-logic`, and `firebase-cli` back into one broad skill.
- Re-expanding `genkit` into a command/example/tutorial dump.

## Durable takeaway
The Firebase AI lane now has a stable four-way decision pattern:
1. app/client SDK integration → `firebase-ai-logic`
2. server-owned reusable workflow → `genkit`
3. Firebase operator/runtime tasks → `firebase-cli`
4. framework-choice ambiguity or comparison → `survey`

Keep the plain route-handler / provider-SDK fallback visible inside `genkit` so the skill does not over-trigger on small backend features.

## Related pages
- [[firebase-ai-workflow-cluster]]
- [[genkit-modernization-2026-04-15]]
- [[firebase-cli-structural-hardening-2026-04-16]]
- [[skill-support-coverage]]
