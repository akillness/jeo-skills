---
title: React best practices support hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, frontend, skill-quality]
sources: [.survey/react-best-practices-support-hardening-20260416/triage.md, .survey/react-best-practices-support-hardening-20260416/context.md, .survey/react-best-practices-support-hardening-20260416/solutions.md, .survey/react-best-practices-support-hardening-20260416/loop-charter.md, .agent-skills/react-best-practices/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# React best practices support hardening 2026-04-16

## Question
What is the best bounded next improvement for `react-best-practices`: leave the canonical React skill as a single-file-plus-AGENTS setup, split it again, or harden it in place with focused support files?

## Decision
Harden `react-best-practices` in place.

## Why
- The graph showed the remaining support-gap list had shrunk to a few intentional alias holdouts plus one canonical frontend anchor: `react-best-practices`.
- Survey results showed the stable user need is not “all 45 rules at once”; it is classifying the bottleneck first, then using the smallest packet for measurement, bundle work, boundary mistakes, hydration/script cost, or rerender churn.
- Teams still work through fragmented tools such as Web Vitals, bundle analyzers, React Profiler, and PR-budget checks, so a lighter `references/` bundle is more reusable than one giant rule catalog.
- Creating another React wrapper would reintroduce overlap with `vercel-react-best-practices`, `performance-optimization`, `state-management`, and other frontend anchors instead of clarifying the lane.

## Accepted changes
- Reframed `react-best-practices` as a measurement-led React / Next.js performance audit skill.
- Added `references/perf-triage-modes.md` for bottleneck classification.
- Added `references/measurement-and-tooling-checklist.md` for profiler / vitals / bundle-analysis workflow.
- Added `references/boundaries-and-route-outs.md` to keep the React lane separate from state, accessibility, responsive, and cross-stack performance work.
- Refreshed `SKILL.toon`, manifest discovery text, README / README.ko / setup prompt wording, and graph outputs.

## Rejected changes
- Adding another React / Next.js performance wrapper.
- Promoting the alias `vercel-react-best-practices` back to a peer canonical skill.
- Leaving the lane as one deep `AGENTS.md` plus a thin surface skill with no lighter references.

## Durable boundary
`react-best-practices` should own measurement-led React / Next.js performance triage for waterfalls, bundle weight, client/server boundary mistakes, hydration/script cost, and rerender churn. It should route app-wide state ownership to [[state-management-modernization-2026-04-13]], accessibility-specific remediation to [[web-accessibility-modernization-2026-04-13]], responsive adaptation to [[responsive-design-modernization-2026-04-13]], and broader cross-stack bottlenecks to [[performance-optimization-modernization-2026-04-14]].

## Related pages
- [[frontend-skill-canonicalization]]
- [[skill-support-coverage]]
- [[react-skill-canonicalization-2026-04-12]]
- [[responsive-design-modernization-2026-04-13]]
- [[state-management-modernization-2026-04-13]]
- [[web-accessibility-modernization-2026-04-13]]
- [[performance-optimization-modernization-2026-04-14]]
