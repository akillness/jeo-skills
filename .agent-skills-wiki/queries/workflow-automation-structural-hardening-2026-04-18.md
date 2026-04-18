---
title: Workflow Automation Structural Hardening
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/workflow-automation-structural-hardening-20260418/context.md, .survey/workflow-automation-structural-hardening-20260418/solutions.md, .survey/workflow-automation-structural-hardening-20260418/loop-charter.md, graphify-out/GRAPH_REPORT.md, .agent-skills/workflow-automation/references/mode-packets-and-route-outs.md]
---

# Workflow Automation Structural Hardening

## Question
What is the best bounded next improvement for the existing `workflow-automation` skill now that support coverage is already complete: add another automation wrapper, or tighten `workflow-automation` into a smaller routing-first front door?

## Answer
Tighten `workflow-automation` in place.

The survey evidence still points to one coherent repo-local workflow layer: task-entrypoints, bootstrap/onboarding commands, local-CI parity wrappers, hook guardrails, maintenance bots, and workflow cleanup. The stronger move is not another wrapper. It is a smaller front door that quickly chooses one mode, recommends the smallest useful surface, and routes environment setup, deployment, Git policy, testing policy, and observability away.

## Why this won
1. Primary-source tool surfaces still map to one repo-local command/orchestration layer rather than a separate product category that justifies another skill.
2. Real practice remains layered: README/docs as the human router, task runners/scripts for entrypoints, hooks for convenience, CI for enforcement, and bots/schedules for recurring maintenance.
3. The graph refresh showed support coverage is already complete repo-wide, so the highest-value maintenance pattern is dense-anchor cleanup and discovery-sync, not more support-folder expansion or new wrappers.
4. `workflow-automation` was still large enough to benefit from the same packet-first structural hardening already applied to neighboring anchors like `git-workflow`, `git-submodule`, and `deployment-automation`.

## Accepted changes
- Shrink `workflow-automation/SKILL.md` from 273 to 213 lines
- Reframe the front door around six modes: task-entrypoints, bootstrap-onboarding, local-ci-parity, hook-guardrails, repo-maintenance, workflow-diagnosis
- Add `references/mode-packets-and-route-outs.md`
- Expand `evals/evals.json` with a repo-maintenance ownership/noise-control case
- Refresh `SKILL.toon`, `skills.json`, `skills.toon`, README.md, README.ko.md, and `setup-all-skills-prompt.md`
- Refresh graph artifacts so the structural layer records the smaller developer-workflow anchor

## Rejected changes
- Adding another generic repo-automation / task-runner / CI-wrapper skill
- Letting `workflow-automation` absorb machine provisioning, deploy architecture, Git repair, or test-policy work
- Treating maintenance bots as fully autonomous instead of an automation surface with human review rules

## Durable findings
- Workflow automation remains strongest as a **routing** skill, not a command catalog.
- The most useful split is between **human-facing entrypoints**, **supporting hooks**, **hosted CI enforcement**, and **scheduled maintenance**.
- Hook and local-CI guidance only stays trustworthy when the skill states bypass/parity limits explicitly.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[workflow-automation-modernization-2026-04-13]]
- [[git-workflow-structural-hardening-2026-04-18]]
- [[git-submodule-structural-hardening-2026-04-18]]
