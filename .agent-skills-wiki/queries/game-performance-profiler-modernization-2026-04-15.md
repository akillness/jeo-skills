---
title: Game Performance Profiler modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [survey, trigger-design, skill-quality, consolidation, game-dev, docs]
sources: [.survey/game-performance-profiler-modernization-20260415/triage.md, .survey/game-performance-profiler-modernization-20260415/context.md, .survey/game-performance-profiler-modernization-20260415/solutions.md, .agent-skills/game-performance-profiler/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Game Performance Profiler modernization 2026-04-15

## Question
What is the best bounded improvement for the repo's game-performance lane: add another Steam Deck/performance wrapper, merge game performance into generic `performance-optimization`, or modernize `game-performance-profiler` itself?

## Answer
The best bounded move is to **modernize `game-performance-profiler` itself** so it starts from the evidence packet teams actually have: screenshots, stat overlays, benchmark-route complaints, packaged-vs-editor ambiguity, and target-device review context.

## Why this was the right ratchet
- The game-development cluster already had a dedicated performance slot, but the skill under-emphasized quick triage packets, reproducible benchmark routes, and packaged-on-device review even though those are the dominant real-world workflows.
- Survey evidence showed that practitioners usually start with `stat unit` / `stat gpu`, overlay screenshots, route notes, and target-device passes before they escalate to Unreal Insights, Frame Debugger, RenderDoc, PIX, or Nsight.
- The lane did not justify a new wrapper because the missing surface was **better trigger clarity and support coverage**, not a new concept.

## Accepted changes
- Rewrote `game-performance-profiler` around five operating modes: quick-triage packet, bottleneck classification, benchmark-route plan, device review, and tool escalation.
- Added `references/capture-packets-and-benchmark-routes.md`, `references/device-review-and-steam-deck.md`, `references/escalation-ladder.md`, refreshed `references/profiling-patterns.md`, and expanded `evals/evals.json`.
- Added `SKILL.toon` and refreshed README / README.ko / setup prompt / `skills.json` wording so discovery surfaces reflect the stronger role.
- Preserved the lane boundary against `performance-optimization`, `game-demo-feedback-triage`, `game-build-log-triage`, and `game-ci-cd-pipeline`.

## Rejected changes
- Adding another Steam Deck-only or perf-review wrapper
- Merging game performance triage into generic `performance-optimization`
- Leaving the lane as a profiler-tool explanation skill with weak route, device, and evidence-packet guidance

## Durable takeaway
In this repo, the runtime game-performance lane should stay split this way:
- frame-time / hitch / device-review triage and next capture choice → `game-performance-profiler`
- mixed player/demo feedback prioritization → `game-demo-feedback-triage`
- build/editor/package failure triage → `game-build-log-triage`
- build/release pipeline design and cache/reproducibility structure → `game-ci-cd-pipeline`
- generic app/service bottleneck work outside engine-specific frame-time triage → `performance-optimization`

## Related pages
- [[game-development-cluster]]
- [[skill-support-coverage]]
- [[bmad-gds-modernization-2026-04-12]]
- [[performance-optimization-modernization-2026-04-14]]
