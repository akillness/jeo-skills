---
title: Browser Review Cluster
created: 2026-04-15
updated: 2026-04-15
type: concept
tags: [skills, consolidation, trigger-design, skill-quality, docs]
sources: [.survey/agentation-modernization-20260415/triage.md, .survey/agentation-modernization-20260415/context.md, .survey/agentation-modernization-20260415/solutions.md, .survey/agentation-modernization-20260415/platform-map.md, .survey/agent-browser-modernization-20260415/triage.md, .survey/agent-browser-modernization-20260415/context.md, .survey/agent-browser-modernization-20260415/solutions.md, .survey/agent-browser-modernization-20260415/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Browser Review Cluster

## Durable finding
The browser/review lane is healthiest when each skill owns a distinct boundary:

- `plannotator` — review and approval of plans or diffs
- `agent-browser` — fresh-session deterministic browser verification with observe → act → observe evidence
- `playwriter` — running-browser / authenticated-session reuse
- `agentation` — exact rendered-UI feedback packets and annotation handoff

## Why it matters
This cluster's biggest risk is not duplicate folder names. It is boundary blur: a weak browser skill can sprawl into runtime choice, generic QA automation, or plan review. The repo gets a cleaner operator story when the browser runtime is chosen first, `agent-browser` owns clean reproducible verification, `playwriter` owns running-browser reuse, and `agentation` is applied only when rendered UI feedback must be captured precisely.

## Maintenance rule
When updating any skill in this cluster:
1. keep runtime choice (`agent-browser` vs `playwriter`) explicit
2. keep `agent-browser` scoped to clean-session verification and explicit evidence, not the user's real browser state
3. keep `plannotator` scoped to plans/diffs
4. keep `agentation` scoped to exact rendered-UI feedback and annotation-loop setup
5. re-check README / README.ko / setup prompt wording because this cluster is heavily indexed

## Related pages
- [[playwriter-modernization-2026-04-15]]
- [[plannotator-modernization-2026-04-13]]
- [[agentation-modernization-2026-04-15]]
- [[agent-browser-modernization-2026-04-15]]
- [[skill-support-coverage]]
- [[core-orchestration-platform-cluster]]
