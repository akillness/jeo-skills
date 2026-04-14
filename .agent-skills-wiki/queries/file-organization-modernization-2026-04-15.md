---
title: File organization modernization
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/file-organization-modernization-20260415/context.md, .survey/file-organization-modernization-20260415/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/file-organization/SKILL.md]
---

# File organization modernization

## Why this was the best bounded move
The survey showed that the highest-value gap was not a missing new structure skill. It was the stale `file-organization` anchor, which still behaved like a static React/Node folder-tree dump even though the surrounding developer-workflow lane had already moved toward decision-first, boundary-aware skills.

Primary evidence this run converged on one pattern:
- Feature-Sliced Design and Bulletproof React both emphasize feature-oriented boundaries once technical folders start scattering one business change across many locations.
- Next.js docs show that framework-native colocation matters, but do not present one universal repo tree.
- Turborepo docs show that `apps/` + `packages/` is a workspace decision, not the default answer for every messy repo.
- MIT's file-structure guidance reinforces the cross-domain point that folder strategy should communicate purpose and support repeatability for collaborators.

That made the best bounded ratchet clear: rewrite `file-organization` into a structure router that chooses the right boundary unit (feature, shared layer, route segment, or package), adds naming/import guardrails, and includes migration planning instead of only showing example trees.

## Accepted changes
- Rewrote `file-organization/SKILL.md` around structure-pressure intake, primary organization modes, route-outs, and migration briefs.
- Added `references/boundary-decision-matrix.md`, `references/migration-checklist.md`, and `references/naming-and-import-rules.md`.
- Added `evals/evals.json` so future loops can dry-run trigger quality and route-outs.
- Refreshed `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces reflect the stronger role.
- Refreshed graph outputs and recorded the support-coverage increase in wiki memory.

## Rejected alternatives
- Adding another separate monorepo or frontend-architecture wrapper skill.
- Keeping `file-organization` as a generic example/template catalog.
- Expanding the skill into component API design, state-boundary policy, environment setup, or task-runner automation.

## Durable boundary rule
`file-organization` should own **repo-structure boundary choice plus migration planning**.
Adjacent concerns stay separate:
- component API shape → `ui-component-patterns` / `design-system`
- state ownership → `state-management`
- runtime/toolchain/services → `system-environment-setup`
- recurring repo automation → `workflow-automation`

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[workflow-automation-modernization-2026-04-13]]
- [[environment-skill-canonicalization-2026-04-12]]
- [[npm-git-install-modernization-2026-04-15]]
