---
title: react-grab structural hardening
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, frontend, trigger-design, skill-quality]
sources: [.survey/react-grab-structural-hardening-20260416/triage.md, .survey/react-grab-structural-hardening-20260416/context.md, .survey/react-grab-structural-hardening-20260416/solutions.md, .agent-skills/react-grab/SKILL.md, .agent-skills/react-grab/references/install-and-routing.md, .agent-skills/react-grab/references/agent-workflows.md, .agent-skills/react-grab/references/troubleshooting.md, graphify-out/GRAPH_REPORT.md]
---

# react-grab structural hardening

## Question
What is the best bounded next improvement after repo-wide support coverage reached 100% across live skills?

## Answer
`react-grab` was the strongest candidate from the required cross-domain scan because it combined three signals at once:
1. a discovery-visible frontend skill with an oversized 494-line `SKILL.md`
2. only one support reference file despite carrying setup, workflow, troubleshooting, and API detail in the front door
3. stale helper-script prerequisites (`Node.js >=18`) that conflicted with upstream raw-source evidence (`node >=22`)

The best bounded fix was to harden the existing skill in place rather than add another browser/frontend wrapper. The accepted move was:
- shrink `react-grab/SKILL.md` into a routing-first front door
- add focused support docs for install/routing, agent workflows, and troubleshooting
- update helper scripts to enforce Node.js >=22
- refresh evals and compact discovery wording around the sharpened boundary

## Why not the alternatives?
- **Keep as-is**: leaves a near-500-line front door plus stale setup claims.
- **Add another wrapper skill**: creates duplicate trigger surface in a frontend/browser lane that already has enough adjacent skills.
- **Merge into `agent-browser` / `playwriter` / `agentation`**: loses the legitimate specialized lane for React element-context capture.

## Durable finding
`react-grab` should stay distinct from both the browser-review cluster and the broader frontend architecture cluster:
- not generic browser automation (`agent-browser`, `playwriter`)
- not rendered-UI annotation (`agentation`)
- not performance diagnosis (`react-best-practices`)
- not design-system or component-library planning (`design-system`, `ui-component-patterns`)

Its job is narrower and more concrete: **capture exact React element context from a live browser UI and hand it to an agent**.

## Keep / revert decision
- **Keep**: smaller routing-first `SKILL.md`, richer focused references, truthful Node.js >=22 prerequisite, sharper route-outs.
- **Revert**: any future attempt to re-bloat the main skill into a mixed install/API manual or to split off a redundant wrapper skill.

## Related pages
- [[frontend-skill-canonicalization]]
- [[browser-review-cluster]]
- [[skill-support-coverage]]
