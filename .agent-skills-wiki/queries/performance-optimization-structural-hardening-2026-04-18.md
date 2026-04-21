---
title: Performance optimization structural hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/performance-optimization-structural-hardening-20260418/triage.md, .survey/performance-optimization-structural-hardening-20260418/context.md, .survey/performance-optimization-structural-hardening-20260418/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Performance optimization structural hardening 2026-04-18

## Question
What was the best bounded next improvement after the `performance-optimization` modernization pass: add another performance wrapper, leave the skill alone, or tighten the existing anchor around the intake packets teams actually bring?

## Why this came next
- The graph refresh still put `performance-optimization` near the top of the code-quality cluster by degree, which makes stale compact/discovery wording more expensive than a minor low-traffic skill issue.
- The canonical skill was already directionally correct, but the compact layer (`SKILL.toon`, `.agent-skills/skills.toon`) still lagged behind with generic optimization language.
- Cross-domain survey evidence kept showing the same workflow reality: users arrive with a trace, CWV report, query plan, benchmark diff, flamegraph, or profiler screenshot, not with a clean optimization brief.

## Survey takeaway
Across CLI/dev workflow, web/fullstack, product/ops, marketing/content, and game-adjacent cases, the repeatable job is:
1. frame the complaint,
2. start from the current artifact packet,
3. choose one tuning mode,
4. name one bottleneck,
5. recommend one or two bounded changes,
6. verify before/after impact,
7. route remaining work to the right neighboring skill.

The evidence did **not** justify another performance wrapper. It justified a tighter front door and better artifact-first routing.

## Decision
Keep `performance-optimization` as the canonical measurement-led tuning skill.

Do **not** add another generic performance helper.

Instead:
- harden the front door around artifact-first intake packets
- preserve clear route-outs to observability, debugging, refactoring, testing policy, and engine-specific profiling
- sync compact/discovery surfaces so the catalog reflects the real boundary

## Accepted changes
- Rewrote `performance-optimization/SKILL.md` around artifact-first intake packets while keeping the front door slightly smaller than the 249-line baseline.
- Added `references/intake-packets-and-escalations.md`.
- Expanded `evals/evals.json` with CWV/report and CI benchmark cases.
- Refreshed `SKILL.toon`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces stop advertising stale generic wording.
- Refreshed `graphify-out/` after the structural pass.

## Rejected changes
- Adding another generic performance wrapper for audits, CWV, or benchmark work
- Folding telemetry rollout into this skill instead of routing to `monitoring-observability`
- Treating correctness debugging or test-policy design as part of the same front door
- Letting Unity/Unreal/Godot capture interpretation replace `game-performance-profiler`

## Durable insight
Once support coverage is complete, the next maintenance win is not “more files” but **truer intake shape**. For `performance-optimization`, that means routing from the packet the user already has into one bottleneck statement and one bounded optimization brief, while keeping all nearby owners explicit.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[performance-optimization-modernization-2026-04-14]]
- [[debugging-structural-hardening-2026-04-18]]
- [[monitoring-observability-modernization-2026-04-14]]
- [[game-performance-profiler-modernization-2026-04-15]]
