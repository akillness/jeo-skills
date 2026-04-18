---
title: Game Performance Profiler structural hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [survey, trigger-design, skill-quality, consolidation, game-dev, graphify, docs]
sources: [.survey/game-performance-profiler-structural-hardening-20260418/triage.md, .survey/game-performance-profiler-structural-hardening-20260418/context.md, .survey/game-performance-profiler-structural-hardening-20260418/solutions.md, .agent-skills/game-performance-profiler/SKILL.md, .agent-skills/game-performance-profiler/references/mode-selection-and-route-outs.md, graphify-out/GRAPH_REPORT.md]
---

# Game Performance Profiler structural hardening 2026-04-18

## Question
What is the best bounded follow-up after the `game-performance-profiler` modernization pass: add another Steam Deck / profiler wrapper, leave the lane alone, or harden the existing skill into a smaller routing-first front door?

## Answer
The best bounded move is to **harden `game-performance-profiler` in place** so it keeps one bottleneck-first profiling brief contract while moving mode-selection and route-out density into focused support references.

## Why this was the right ratchet
- The graph scan showed full support coverage across the live corpus, which means the next win in this lane should come from dense-anchor cleanup rather than missing `references/` or `evals/` folders.
- `game-performance-profiler` still sat on the oversized front-door watchlist at 296 lines even though the packet, device-review, escalation, and profiling-pattern references already existed.
- Primary-source docs still support the packet-first structure: Unity keeps Profiler and Frame Debugger separate; Unreal distinguishes first-pass `stat` commands from Unreal Insights; Steam Deck review remains target-device specific.
- The game-development cluster already has the right neighboring specialists (`bmad-gds`, `game-build-log-triage`, `game-demo-feedback-triage`, `steam-store-launch-ops`), so another wrapper would add noise rather than leverage.

## Accepted changes
- Shrunk `game-performance-profiler/SKILL.md` from 296 lines to 231 lines.
- Added `references/mode-selection-and-route-outs.md` so the front door can stay routing-first while preserving deterministic mode picks and neighbor boundaries.
- Added a build-failure route-out case to `evals/evals.json`.
- Refreshed `SKILL.toon`, `skills.json`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery wording matches the sharper bottleneck-first boundary.
- Regenerated `graphify-out/` and confirmed the skill no longer appears on the oversized watchlist.

## Rejected changes
- Adding another Steam Deck-only, GPU-tool-only, or generic game-performance wrapper
- Folding game-engine frame-time triage back into `performance-optimization`
- Leaving the denser front door untouched after support coverage reached 100%

## Durable takeaway
In this repo, the game runtime-performance lane should stay split this way:
- runtime frame-time triage, benchmark routes, target-device review, and profiler escalation → `game-performance-profiler`
- build/editor/package failure triage → `game-build-log-triage`
- mixed milestone and specialist coordination → `bmad-gds`
- playtest/demo/community feedback weighting → `game-demo-feedback-triage`
- Steam visibility / page promise / event timing / launch ops → `steam-store-launch-ops`
- generic non-engine performance tuning → `performance-optimization`

## Related pages
- [[game-development-cluster]]
- [[skill-support-coverage]]
- [[game-performance-profiler-modernization-2026-04-15]]
- [[performance-optimization-structural-hardening-2026-04-18]]
