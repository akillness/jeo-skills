---
title: bmad-idea modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/bmad-idea-modernization-20260415/triage.md, .survey/bmad-idea-modernization-20260415/context.md, .survey/bmad-idea-modernization-20260415/solutions.md, .agent-skills/bmad-idea/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# bmad-idea modernization 2026-04-15

## Question
What is the best bounded improvement for `bmad-idea` given the repo's current orchestration, marketing, and game-production boundaries?

## Answer
Modernize `bmad-idea` into the repo's pre-planning idea router: normalize the early-stage packet, choose one framing mode, produce one concept artifact, and route explicitly into `bmad`, `task-planning`, `marketing-automation`, or `bmad-gds` instead of keeping a legacy command/persona catalog.

## Accepted changes
- Rewrote `.agent-skills/bmad-idea/SKILL.md` around mode selection, concept artifacts, and explicit route-outs.
- Added `references/operating-modes.md`, `references/handoff-boundaries.md`, and `references/concept-packet-template.md`.
- Added `evals/evals.json` and refreshed `SKILL.toon` plus `REFERENCE.md`.
- Updated `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, and `.agent-skills/skills.toon` so discovery surfaces match the stronger role.
- Refreshed `graphify-out/` and recorded the support-coverage increase.

## Rejected changes
- Adding another creativity / ideation wrapper skill.
- Keeping `bmad-idea` as a five-persona catalog with no reusable artifact model.
- Letting early idea framing overlap deeply with `bmad`, `marketing-automation`, or `bmad-gds`.

## Why this should stick
This follows the repo's durable ratchet: strengthen a high-visibility weak anchor, add support files and evals, and tighten downstream boundaries instead of expanding the catalog.

## Links
- [[skill-support-coverage]]
- [[bmad-modernization-2026-04-15]]
- [[marketing-cluster]]
- [[game-development-cluster]]
