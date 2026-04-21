---
title: Workflow Automation Modernization
date: 2026-04-13
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/workflow-automation-modernization-20260413/context.md, .survey/workflow-automation-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/workflow-automation/references/handoff-boundaries.md]
---

# Workflow Automation Modernization

## Question
What is the best bounded improvement for the repo's legacy `workflow-automation` skill: add another automation wrapper, or modernize `workflow-automation` into a repo-scoped recurring-workflow anchor?

## Answer
Modernize `workflow-automation`.

A new adjacent wrapper would create more activation noise in a lane that already touches `git-workflow`, `system-environment-setup`, `deployment-automation`, `testing-strategies`, and maintenance bots. The stronger move is to keep one clear workflow-automation anchor and rewrite it around modern repo reality:
- recurring workflow pain is usually command sprawl, onboarding drift, local-vs-CI mismatch, or brittle hook/setup glue
- the highest-value work is choosing the smallest useful automation surface instead of teaching every tool equally
- route-outs matter because environment provisioning, deployment, and local Git recovery are neighboring jobs, not sub-steps of every automation request

## Why this won
1. The legacy skill was a broad example dump with weak trigger quality and no support files.
2. Survey evidence showed real practice still mixes task runners, shell glue, hooks, CI wrappers, and maintenance bots instead of converging on one workflow product.
3. The repo already had a modern `git-workflow` anchor, which made the utilities/developer-workflow boundary easier to define cleanly.
4. The graph-backed maintenance pattern still favors upgrading indexed legacy anchors instead of adding overlapping wrappers.

## Accepted changes
- Rewrite `workflow-automation` as a repo-scoped recurring-workflow skill
- Add `references/automation-modes.md`
- Add `references/handoff-boundaries.md`
- Add `evals/evals.json`
- Update README / README.ko / setup prompt / `skills.json` so discovery surfaces reflect the sharper role
- Refresh graph outputs so support coverage and utilities/developer-workflow structure reflect the upgrade

## Rejected changes
- Adding another generic task-runner or DevOps wrapper in the same lane
- Letting `workflow-automation` absorb environment provisioning, deployment architecture, or local Git mechanics
- Keeping the legacy kitchen-sink structure and only trimming a few examples

## Durable findings
- Workflow automation skills improve most when they classify the recurring workflow first and then pick the smallest useful surface.
- Idempotent, non-interactive entrypoints are a durable quality gate across bootstrap, hooks, local-CI parity, and repo maintenance modes.
- A thin command map plus explicit route-outs transfers better than a giant catalog of tool-specific snippets.

## Related pages
- [[skill-support-coverage]]
- [[developer-workflow-cluster]]
- [[git-workflow-modernization-2026-04-12]]
- [[environment-skill-canonicalization-2026-04-12]]
