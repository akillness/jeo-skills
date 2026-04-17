---
title: User Guide Writing Structural Hardening (2026-04-17)
created: 2026-04-17
updated: 2026-04-17
type: query
tags: [skills, survey, trigger-design, skill-quality, docs, consolidation]
sources: [.survey/user-guide-writing-structural-hardening-20260417/context.md, .survey/user-guide-writing-structural-hardening-20260417/solutions.md, .agent-skills/user-guide-writing/SKILL.md, .agent-skills/user-guide-writing/references/mode-structures.md, graphify-out/GRAPH_REPORT.md]
---

# User Guide Writing Structural Hardening (2026-04-17)

## Question
What is the best bounded follow-up for `user-guide-writing` after the earlier modernization pass?

## Answer
Harden `user-guide-writing` in place instead of creating another help-center or product-education wrapper.

The survey and graph refresh pointed to the same gap:
- the documentation cluster already had sharper anchors for internal docs, API docs, and release-note work
- `user-guide-writing` still carried too much inline structure and not enough guidance about the smallest useful artifact packet
- mature documentation systems solve this with stronger page-type separation and bounded packets, not another overlapping top-level skill

## Accepted changes
- Shrunk `user-guide-writing/SKILL.md` from 314 lines to 235 lines.
- Added `references/mode-structures.md` so slower-changing page skeletons live outside the front door.
- Tightened the front door around one primary mode plus one output shape (`single-page`, `guide-plus-faq`, `refresh-packet`, `guide-set`).
- Expanded eval coverage with packet-shape and route-out cases for `technical-writing`, `api-documentation`, and `changelog-maintenance`.
- Refreshed discovery wording in `SKILL.toon`, `.agent-skills/skills.json`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`.

## Rejected changes
- Adding a separate help-center or docs-program wrapper skill.
- Re-expanding the front door with more inline templates.
- Collapsing user-doc work into `technical-writing` or broadening it into release-note ownership.

## Why this should transfer
The improvement is structural, not product-specific. User-doc requests across SaaS, admin tools, docs sites, and help centers repeatedly need the same decision: which page type is this, and what is the smallest artifact packet that solves the problem without turning into a giant mixed-purpose guide?

## Related pages
- [[documentation-cluster]]
- [[skill-support-coverage]]
- [[user-guide-writing-modernization-2026-04-13]]
- [[technical-writing-structural-hardening-2026-04-17]]
- [[api-documentation-structural-hardening-2026-04-17]]
