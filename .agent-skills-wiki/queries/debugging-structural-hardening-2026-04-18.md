---
title: Debugging Structural Hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify]
sources: [.survey/debugging-structural-hardening-20260418/triage.md, .survey/debugging-structural-hardening-20260418/context.md, .survey/debugging-structural-hardening-20260418/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/debugging/SKILL.md]
---

# Debugging Structural Hardening 2026-04-18

## Decision
Harden the existing `debugging` skill in place instead of adding another troubleshooting, flake, CI-debug, or env-diff wrapper.

## Why this won
- The graph refresh still showed `debugging` as the highest-degree live skill, so a smaller routing-first front door was more valuable than another adjacent skill.
- Survey evidence across Playwright, GitHub Actions, `git bisect`, and Google's flaky-test writeup converged on the same durable pattern: reproduce, isolate, verify — with different *mode packets* for regressions, flakes, env mismatches, and artifact-led cases.
- The biggest remaining gap was not support coverage; it was truthful **mode selection and handoff clarity** across `log-analysis`, `testing-strategies`, `code-review`, and `performance-optimization`.
- Compact/discovery drift still mattered: `SKILL.toon`, `skills.json`, README, README.ko, and setup surfaces needed to match the sharper positioning.

## Accepted changes
- Shrunk `debugging/SKILL.md` from the old 297-line front door to a tighter routing-first diagnosis skill.
- Added `references/mode-selection-and-fast-checks.md` for regression, flaky, env/config, artifact-led, and runtime/browser/game-loop packets.
- Expanded `evals/evals.json` with env/config mismatch and performance-handoff cases while keeping regression, flake, and log-triage coverage.
- Refreshed `SKILL.toon`, `skills.json`, `.agent-skills/skills.toon`, README, README.ko, and setup discovery wording so the skill no longer reads like a generic troubleshooting catch-all.
- Refreshed graph outputs to record the smaller front door and preserve the no-new-wrapper decision.

## Rejected changes
- Adding a new debugging-adjacent wrapper for CI/debug logging, flaky tests, or env mismatches
- Letting `debugging` absorb raw symptom-first log triage already owned by `log-analysis`
- Letting `debugging` absorb pure performance/bottleneck work that belongs with `performance-optimization`
- Re-expanding the front door with long tool catalogs when the case-specific packets can live in references

## Durable finding
For high-traffic code-quality anchors, the next reusable ratchet after support coverage reaches 100% is **mode-selection cleanup plus derived-surface sync**: keep the main skill small, move slow-changing tactics into packet references, and make sure compact/README/setup surfaces tell the same truth.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[debugging-modernization-2026-04-13]]
- [[log-analysis-modernization-2026-04-13]]
- [[performance-optimization-modernization-2026-04-14]]
