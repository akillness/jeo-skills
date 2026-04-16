---
title: Firebase CLI structural hardening
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, skill-quality, trigger-design, docs, survey]
sources: [.survey/firebase-cli-structural-hardening-20260416/triage.md, .survey/firebase-cli-structural-hardening-20260416/context.md, .survey/firebase-cli-structural-hardening-20260416/solutions.md, .agent-skills/firebase-cli/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Firebase CLI structural hardening

## Decision
Harden `firebase-cli` in place instead of adding another Firebase wrapper skill.

## Why this won
- The old skill still behaved like a large command catalog even though the repo now prefers routing-first front doors with support packets.
- Survey evidence showed repeated real workflows cluster into install/auth, bootstrap/config, local emulators, deploy/release, and admin/data operations.
- The Firebase lane already has the right adjacent skills: `genkit` for backend AI workflow orchestration and `firebase-ai-logic` for direct app/client SDK integration.
- The graph refresh confirmed the bigger risk is a dense high-utility anchor drifting across boundaries, not a missing new skill.

## Accepted changes
- Rewrite `firebase-cli` into a routing-first Firebase platform/operator anchor.
- Add focused `references/` docs for routing, install/auth/bootstrap, emulator/release workflows, and admin/data operations.
- Refresh evals to test mode selection, CI auth preference, and route-outs to `genkit`.
- Refresh compact/discovery surfaces and top-level docs so the Firebase boundary is visible outside the skill folder.

## Rejected changes
- Adding another Firebase operations wrapper.
- Merging Firebase CLI ownership into `genkit` or `firebase-ai-logic`.
- Keeping one giant front door as the main maintenance surface.

## Durable takeaway
The durable Firebase split is now clean again: `firebase-cli` owns project/bootstrap/deploy/admin operations, `firebase-ai-logic` owns direct in-app Gemini SDK wiring, and `genkit` owns backend workflow orchestration. Future Firebase maintenance should improve one of those three anchors, not spawn a fourth bucket.

## Related pages
- [[firebase-ai-workflow-cluster]]
- [[skill-support-coverage]]
