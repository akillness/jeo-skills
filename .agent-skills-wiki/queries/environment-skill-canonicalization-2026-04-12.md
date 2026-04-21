---
title: Environment Skill Canonicalization
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, survey, consolidation, trigger-design, skill-quality, docs]
sources: [.survey/environment-skill-canonicalization-20260412/context.md, .survey/environment-skill-canonicalization-20260412/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Environment Skill Canonicalization

## Decision
Upgrade the overlapping environment pair into a **canonical broader skill plus a narrower compatibility alias** instead of keeping two weak peer skills or adding another setup wrapper.

## Why this won
The survey showed that real environment pain appears at the boundary between:
- runnable local environments and onboarding
- local service parity and containers
- app-level `.env` structure and env validation
- secret handoff and config drift

The stronger split is not "environment" versus "system" as equal peers. The stronger split is:
- **broader runnable-environment setup** → `system-environment-setup`
- **narrower app-config / `.env` / validation** → `environment-setup`

## Accepted changes
- Rewrite `system-environment-setup` as the canonical broader environment anchor
- Rewrite `environment-setup` as the narrower app-config compatibility skill
- Add `references/` and `evals/` to both skills
- Update `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json` so discovery surfaces reflect the canonical/alias boundary
- Refresh graph outputs so support coverage and consolidation notes match the new structure

## Rejected changes
- Adding a new third environment/setup skill
- Hard-deleting `environment-setup` in the same run
- Keeping both skills as generic peers with overlapping descriptions

## Durable takeaway
For infrastructure/setup skills, the repo should prefer **one canonical broader environment anchor** and treat `.env` / config guidance as a narrower compatibility entry point. This keeps trigger precision high while still matching how users actually phrase setup problems.

## Related pages
- [[infrastructure-environment-cluster]]
- [[skill-support-coverage]]
- [[git-workflow-modernization-2026-04-12]]
