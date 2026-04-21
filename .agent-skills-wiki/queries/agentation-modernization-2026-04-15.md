---
title: Agentation modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs, graphify]
sources: [.survey/agentation-modernization-20260415/triage.md, .survey/agentation-modernization-20260415/context.md, .survey/agentation-modernization-20260415/solutions.md, .survey/agentation-modernization-20260415/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Agentation modernization 2026-04-15

## Why this was the best bounded improvement
`agentation` was a high-visibility planning/review skill in the JEO path, but it still read like a giant install/config/API catalog instead of a decision-first UI annotation router. The best bounded move was to modernize the existing skill and strengthen support coverage instead of adding another browser or QA wrapper.

## Durable findings
- `agentation` should own the **exact rendered-UI feedback** lane.
- `agent-browser` should remain the fresh-session / deterministic browser verifier.
- `playwriter` should remain the running-browser / authenticated-session reuse lane.
- `plannotator` should remain the review/approval gate for plans and diffs.
- This run also exposed a discovery-surface trust gap: top-level repo surfaces had drifted to stale 85-skill wording even though the corpus already had 89 installable skills.

## Accepted changes
- Rewrote `agentation/SKILL.md` into a shorter, decision-first UI annotation router.
- Added `references/` docs for routing, platform setup/hooks, and watch-loop/self-driving patterns.
- Added `evals/evals.json` covering exact UI annotation activation plus route-outs to `agent-browser` and `plannotator`.
- Updated `SKILL.toon`, `skills.json`, README / README.ko / setup prompt, and fixed the stale 85 → 89 discovery-count drift on touched surfaces.
- Refreshed graph outputs and recorded the browser-review boundary as a durable cluster note.

## Rejected changes
- Adding another browser, UI-review, or QA wrapper.
- Letting `agentation` act like the browser runtime instead of the feedback bridge.
- Treating hook/setup detail as the main skill instead of moving it into support references.

## Structural note
The graph-backed maintenance pattern still holds: a weak high-traffic anchor is usually better fixed by explicit route-outs plus support files than by creating another overlapping skill. `agentation` now fits the same browser-review cluster logic as `plannotator`, `agent-browser`, and `playwriter`.

## Related pages
- [[browser-review-cluster]]
- [[playwriter-modernization-2026-04-15]]
- [[plannotator-modernization-2026-04-13]]
- [[skill-support-coverage]]
- [[core-orchestration-platform-cluster]]
