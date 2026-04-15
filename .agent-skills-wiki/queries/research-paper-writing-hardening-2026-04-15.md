---
title: Research Paper Writing Hardening
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, skill-quality, docs]
sources: [.survey/research-paper-writing-hardening-20260415/context.md, .survey/research-paper-writing-hardening-20260415/solutions.md, .agent-skills/research-paper-writing/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Research Paper Writing Hardening

## Question
What is the best bounded improvement for `research-paper-writing` right now: add a new adjacent paper/rebuttal skill, broadly expand it into generic academic tooling, or harden the existing skill with sharper manuscript-package boundaries and support files?

## Answer
Harden the existing skill.

The evidence from the survey points to a fragmented manuscript workflow — manuscript editor, references, figures, reviewer-response matrix, venue portal — rather than a missing umbrella tool. The most transferable repository improvement is to keep `research-paper-writing` specialized for manuscript-package work and add durable support for:
- claim → evidence mapping,
- experiment / figure / table coverage,
- rebuttal and camera-ready revision.

## Why this won
- The documentation cluster already has separate anchors for internal docs, API docs, user docs, release notes, decks, and marketing routing, so widening `research-paper-writing` would blur boundaries instead of helping.
- The previous skill already had decent core manuscript steps; the biggest quality gap was missing `references/` and `evals/`.
- Real-world paper workflows still rely on manual rebuttal matrices, figure iteration loops, and evidence packaging, which means support files are more valuable than another top-level catalog entry.

## Accepted changes
- Rewrote `research-paper-writing` around manuscript-package outputs, stage selection, reviewer-risk checks, and route-outs.
- Added three focused reference docs covering claim/evidence packets, experiment + figure coverage, and rebuttal / camera-ready workflow.
- Added `evals/evals.json` to ratchet abstract, experiment-plan, and rebuttal behavior.
- Refreshed `SKILL.toon`, `skills.json`, README surfaces, and setup prompt wording so discovery matches the stronger boundary.

## Rejected directions
- Adding another overlapping research-paper / rebuttal / reviewer-response skill.
- Broadening the skill into generic literature discovery, reference-manager operations, or general technical-writing work.
- Leaving the skill as a prose-only writing helper without support files.

## Durable boundary
Keep `research-paper-writing` for:
- academic manuscript structure,
- claim/evidence coverage,
- figure/table support,
- reviewer response,
- camera-ready revision.

Route out anything that is really internal docs, API docs, user help, decks, or broad marketing messaging.

## Related pages
- [[documentation-cluster]]
- [[skill-support-coverage]]
- [[presentation-builder-modernization-2026-04-15]]
