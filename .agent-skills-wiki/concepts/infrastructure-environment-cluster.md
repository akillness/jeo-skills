---
title: Infrastructure Environment Cluster
created: 2026-04-12
updated: 2026-04-12
type: concept
tags: [skills, consolidation, trigger-design, skill-quality, docs]
sources: [.survey/environment-skill-canonicalization-20260412/context.md, .survey/environment-skill-canonicalization-20260412/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Infrastructure Environment Cluster

## Durable finding
The repo's environment/setup lane works best as a **canonical broader skill plus a narrower app-config alias**, not as two peer environment skills.

Current stable shape:
- `system-environment-setup` = canonical broader anchor for runnable repos, toolchains, local services, Docker/devcontainers, onboarding, and setup-drift diagnosis
- `environment-setup` = narrower compatibility skill for `.env` files, env precedence, validation, public/private config boundaries, and secret handoff

## Why this matters
Developers usually start from a single workflow question: **how do I get this repo running consistently?**
That broader question spans:
- machine/tool reproducibility
- local service topology
- bootstrap/onboarding
- app-config correctness
- secret and env-file drift

Keeping two vague peer skills makes routing worse. A canonical-plus-alias shape keeps the surface stable without losing the narrower config entry point.

## Operational rule
- Keep `system-environment-setup` broad and decision-oriented.
- Keep `environment-setup` narrow and app-config oriented.
- Update docs and manifest surfaces whenever the boundary wording changes.
- If future work adds secret-manager or Nix depth, treat it as a sub-pattern under the canonical environment lane unless demand clearly justifies a sharper specialist skill.

## Related pages
- [[skill-support-coverage]]
- [[environment-skill-canonicalization-2026-04-12]]
- [[frontend-skill-canonicalization]]
