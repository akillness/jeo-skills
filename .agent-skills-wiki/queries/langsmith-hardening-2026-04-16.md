---
title: LangSmith hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, search-analysis, skill-quality]
sources: [.survey/langsmith-hardening-20260416/triage.md, .survey/langsmith-hardening-20260416/context.md, .survey/langsmith-hardening-20260416/solutions.md, .survey/langsmith-hardening-20260416/platform-map.md, .agent-skills/langsmith/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# LangSmith hardening 2026-04-16

## Question
What is the best bounded next improvement for the existing `langsmith` skill: leave it as a feature-heavy reference, split it into smaller wrapper skills, or modernize it in place?

## Decision
Modernize `langsmith` in place.

## Why
- The support-gap list had shrunk to a small residue of high-utility skills without evals, and `langsmith` was one of the most visible remaining holdouts.
- The old skill had solid SDK detail and references, but it still behaved like a long feature tour with weak workflow routing.
- Survey results showed the stable user need is not “all LangSmith features”; it is choosing the right packet: debugging traces, offline evals, online review, prompt-registry work, or multi-service propagation.
- Creating tracing-only or eval-only wrappers would increase overlap with `monitoring-observability`, `debugging`, and deployment/runtime-policy skills instead of clarifying boundaries.

## Accepted changes
- Rewrote `langsmith` into a mode-selecting operator skill.
- Added `references/modes-and-routing.md` for workflow selection and route-outs.
- Added `evals/evals.json` so future maintenance can validate debugging/eval/review triggers.
- Synced `SKILL.toon`, manifest discovery text, README / README.ko / setup prompt, and graph outputs.

## Rejected changes
- Adding a second LangSmith wrapper focused only on tracing or only on Prompt Hub.
- Treating LangSmith as the generic observability, deployment, or runtime guardrail control plane.
- Leaving the skill as a 300-line feature encyclopedia with no eval harness.

## Durable boundary
`langsmith` should own LLM-specific tracing, eval packets, review queues, prompt-registry decisions, and cross-service trace propagation. It should route generic telemetry/alert design to [[monitoring-observability]], root-cause reproduction to [[debugging-modernization-2026-04-13]], and rollout procedure to [[deployment-automation-modernization-2026-04-13]].

## Related pages
- [[skill-support-coverage]]
- [[search-analysis-cluster]]
- [[monitoring-observability-modernization-2026-04-14]]
- [[debugging-modernization-2026-04-13]]
- [[deployment-automation-modernization-2026-04-13]]
