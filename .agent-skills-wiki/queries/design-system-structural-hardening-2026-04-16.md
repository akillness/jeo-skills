---
title: design-system structural hardening
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, frontend, trigger-design, skill-quality]
sources: [.survey/design-system-structural-hardening-20260416/triage.md, .survey/design-system-structural-hardening-20260416/context.md, .survey/design-system-structural-hardening-20260416/solutions.md, .agent-skills/design-system/SKILL.md, .agent-skills/design-system/references/system-modes.md, .agent-skills/design-system/references/token-and-governance-checklist.md, .agent-skills/design-system/references/scope-boundaries.md, .agent-skills/design-system/references/design-system-packet-template.md, graphify-out/GRAPH_REPORT.md]
---

# design-system structural hardening

## Question
What is the best bounded next frontend-cluster improvement after canonical-vs-alias cleanup and repo-wide support coverage completion?

## Answer
`design-system` became the strongest candidate because it was already the canonical frontend UI-system anchor but still behaved like an older monolithic manual:
1. 459-line front door with mixed token dumps, page examples, motion CSS, accessibility checklist, troubleshooting, and metadata residue
2. only one canonical support reference while neighboring frontend anchors already used focused packets
3. a stale related-skill link (`image-generation`) that showed real maintenance drift

The best bounded fix was to harden the existing canonical skill in place rather than add another frontend wrapper. The accepted move was:
- shrink `design-system/SKILL.md` into a mode-selecting router
- add focused references for system modes, token/governance checks, boundaries, and packet output
- refresh evals and compact discovery wording around route-outs
- update public discovery surfaces so the canonical description reflects governance-first ownership instead of a generic UI generator

## Why not the alternatives?
- **Keep as-is**: leaves the canonical anchor structurally older than neighboring frontend skills.
- **Add another wrapper skill**: increases trigger noise in a lane that already has clear neighboring owners.
- **Reopen alias work**: the alias decision was already settled; the problem was the canonical front door.
- **Merge into `ui-component-patterns` or `web-design-guidelines`**: would blur system governance with component architecture or broad UI critique.

## Durable finding
The strongest next-step improvements in the frontend cluster are now mostly **dense-anchor hardening**, not missing-skill creation. `design-system` should own:
- shared token/governance rules
- primitive naming and promotion policy
- cross-surface system direction

It should **not** absorb:
- component-family API design (`ui-component-patterns`)
- layout collapse and responsive verification (`responsive-design`)
- accessibility remediation (`web-accessibility`)
- broad page/flow critique (`web-design-guidelines`)

## Keep / revert decision
- **Keep**: routing-first front door, focused support docs, sharper route-outs, stale-skill cleanup, updated discovery wording.
- **Revert**: any future attempt to turn the main skill back into a long mixed example dump or to reintroduce another overlapping frontend wrapper.

## Related pages
- [[frontend-skill-canonicalization]]
- [[skill-support-coverage]]
- [[design-system-canonicalization-2026-04-12]]
- [[responsive-design-modernization-2026-04-13]]
- [[ui-component-patterns-modernization-2026-04-13]]
- [[web-design-guidelines-modernization-2026-04-14]]
