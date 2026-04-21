---
title: Deployment Automation Structural Hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify]
sources: [.survey/deployment-automation-structural-hardening-20260416/triage.md, .survey/deployment-automation-structural-hardening-20260416/context.md, .survey/deployment-automation-structural-hardening-20260416/solutions.md, .survey/deployment-automation-structural-hardening-20260416/loop-charter.md, graphify-out/GRAPH_REPORT.md]
---

# Deployment Automation Structural Hardening 2026-04-16

## Question
After `deployment-automation` was already modernized into the release-execution anchor, what is the best bounded next improvement: add another deployment wrapper, reopen the concept boundary, or structurally harden the existing skill?

## Decision
Structurally harden `deployment-automation` in place: shrink the front door, move packet and strategy detail into focused references, refresh the compact discovery surface, keep evals aligned, and sync discovery docs where the sharpened release-hardening / rollback-response wording materially improves routing.

## Why this won
- The graph showed complete support coverage across the live catalog, so adding another deployment wrapper would create noise instead of leverage.
- `deployment-automation` was still one of the biggest front doors in the repo (408 lines) even though the lane’s conceptual boundary was already correct.
- Repo-local evidence plus Kubernetes / Argo / Vercel primary surfaces confirmed that preview, promotion, rollout strategy, rollback, and platform handoff are still the core operator modes worth preserving — but they do not need to stay embedded in the main skill file.
- The right maintenance move matched the repo’s current ratchet pattern: keep the canonical anchor, shrink the front door, and package the repeatable detail into references.

## Accepted changes
- Rewrite `deployment-automation/SKILL.md` from 408 lines to 213 lines while preserving the release-execution boundary.
- Add `references/release-packet-templates.md` and `references/strategy-selection-and-stop-conditions.md`.
- Refresh `evals/evals.json` with an explicit Vercel route-out case.
- Refresh `SKILL.toon`, `.agent-skills/skills.json`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces reflect rollback-response / release-hardening language.
- Refresh graph artifacts and record the dense-anchor cleanup result in the wiki.

## Rejected alternatives
- Adding another CI/CD or release wrapper.
- Re-expanding the front door into a blended handbook.
- Letting the skill absorb CI authoring, machine bootstrap, observability architecture, or Vercel-specific operations.

## Durable takeaway
Once support coverage is complete, the best maintenance wins often come from shrinking dense canonical anchors instead of adding new skills. In the infrastructure lane, `deployment-automation` should remain the vendor-neutral release-execution router, while CI authoring, runnable-machine setup, telemetry architecture, and provider-specific operations stay in their own skills.

## Related pages
- [[skill-support-coverage]]
- [[developer-workflow-cluster]]
- [[deployment-automation-modernization-2026-04-13]]
- [[vercel-deploy-modernization-2026-04-15]]
