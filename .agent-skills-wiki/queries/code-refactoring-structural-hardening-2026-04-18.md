---
title: Code Refactoring Structural Hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/code-refactoring-structural-hardening-20260418/triage.md, .survey/code-refactoring-structural-hardening-20260418/context.md, .survey/code-refactoring-structural-hardening-20260418/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Code Refactoring Structural Hardening 2026-04-18

## Question
What is the best bounded next improvement for the repo's `code-refactoring` lane after modernization, given that the code-quality cluster is already crowded and support coverage is complete?

## Decision
Harden `code-refactoring` in place instead of adding another code-quality wrapper. The durable fix is to shrink the front door into a packet-first cleanup anchor, start from the artifact the user already has, keep one primary refactor mode per run, move packet detail into a focused reference, and sync the compact/discovery surfaces so the repo stops advertising a stale DRY/SOLID design-pattern helper.

## Why this won
- `graphify-out/GRAPH_REPORT.md` still flagged `code-refactoring` on the oversized front-door watchlist.
- The code-quality cluster already has stable neighboring owners for diagnosis, review judgment, validation policy, bottleneck analysis, and impact mapping.
- `SKILL.toon` and `skills.toon` still lagged the modernized skill and quietly weakened trigger precision.
- External primary-source evidence reinforced the same split: Fowler emphasizes small behavior-preserving transformations, while `jscodeshift`, OpenRewrite, `ast-grep`, and Comby show that repeated migrations belong to an explicit tool-assisted lane instead of generic pattern advice.

## Accepted changes
- Rewrote `code-refactoring/SKILL.md` around cleanup packets, primary mode choice, behavior guardrails, and explicit route-outs.
- Added `references/intake-packets-and-route-outs.md`.
- Expanded `evals/evals.json` with a search-first blast-radius route-out case.
- Synced `SKILL.toon`, `skills.toon`, `skills.json`, README, README.ko, and setup discovery wording.
- Refreshed graph outputs so the watchlist and highlight reflect the smaller front door.

## Rejected alternatives
- Adding another generic technical-debt / cleanup / codemod wrapper.
- Letting `code-refactoring` absorb debugging, review judgment, performance bottleneck triage, or pure impact mapping.
- Keeping the modernized core skill while leaving stale compact discovery surfaces untouched.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[code-refactoring-modernization-2026-04-14]]
- [[debugging-structural-hardening-2026-04-18]]
- [[code-review-structural-hardening-2026-04-18]]
- [[performance-optimization-structural-hardening-2026-04-18]]
