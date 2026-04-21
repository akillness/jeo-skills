---
title: plannotator structural hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, consolidation, trigger-design, skill-quality, docs]
sources: [.survey/plannotator-structural-hardening-20260419/triage.md, .survey/plannotator-structural-hardening-20260419/context.md, .survey/plannotator-structural-hardening-20260419/solutions.md, .survey/plannotator-structural-hardening-20260419/platform-map.md, graphify-out/GRAPH_REPORT.md, .agent-skills/plannotator/SKILL.md]
---

# plannotator structural hardening 2026-04-19

## Question
What is the best bounded next improvement for `plannotator` after the 2026-04-13 modernization pass?

## Answer
The best bounded follow-up was **not** adding another browser-review wrapper or broadening `plannotator` into general PR policy. It was shrinking the front door into a **review-packet router** that chooses among `plan-review`, `diff-review`, `markdown-review`, `platform-setup`, and `troubleshooting`, while making native-hook vs manual-review reality explicit across Claude, Gemini, Codex, and OpenCode.

## Why this won
- Upstream evidence shows the tool's strongest unique value is still the **visual approval gate before execution**, not generic PR review.
- User feedback showed real friction around **auto-invocation vs manual review**, especially on OpenCode.
- Codex now has public hooks, but upstream `plannotator` docs still describe a more manual/partial path, so the skill needed to stop implying parity it could not support.
- Spec-driven users increasingly want markdown/spec review, which fits the visual-review boundary better than the old note-export-heavy framing.

## Accepted changes
- Reframed `plannotator` as a routing-first visual approval gate for concrete plans, markdown specs, and diffs.
- Added `references/intake-packets-and-route-outs.md` as the main packet router.
- Refreshed platform and troubleshooting docs around native-hook vs manual-review truthfulness.
- Expanded eval coverage for markdown/spec review and Codex setup honesty.
- Synced compact and discovery surfaces (`SKILL.toon`, `skills.json`, `skills.toon`, README, README.ko, setup prompt).

## Rejected changes
- Adding another browser-review or plan-review wrapper.
- Letting `plannotator` absorb planning/spec creation, orchestration state, or broad PR governance.
- Pretending all runtimes have the same plan-review maturity.
- Keeping note export as a primary trigger when it should remain a secondary follow-up.

## Durable boundary
Keep the browser-review cluster split like this:
- `plannotator` → concrete plan/spec/diff review packets and approval handoff
- `agent-browser` → clean disposable browser verification with explicit evidence
- `playwriter` → running-browser / authenticated-session reuse
- `agentation` → exact rendered-UI critique that should turn into code fixes

## Related pages
- [[browser-review-cluster]]
- [[plannotator-modernization-2026-04-13]]
- [[agent-browser-modernization-2026-04-15]]
- [[agentation-modernization-2026-04-15]]
- [[skill-support-coverage]]
