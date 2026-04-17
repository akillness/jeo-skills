---
title: Code Quality Cluster
created: 2026-04-13
updated: 2026-04-18
type: concept
tags: [skills, consolidation, trigger-design, skill-quality]
sources: [.survey/testing-strategies-modernization-20260413/context.md, .survey/testing-strategies-modernization-20260413/solutions.md, .survey/code-refactoring-modernization-20260414/context.md, .survey/code-refactoring-modernization-20260414/solutions.md, .survey/performance-optimization-modernization-20260414/context.md, .survey/performance-optimization-modernization-20260414/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Code Quality Cluster

## Durable finding
The code-quality lane is cleaner when each high-traffic skill owns a different stage of the confidence loop instead of all of them offering generic "quality" advice.

Current cluster shape:
- `code-refactoring` = structural cleanup: simplify, decompose, deduplicate, and stage behavior-preserving migrations
- `testing-strategies` = policy and orchestration: choose validation depth, gate scope, and exception language
- `backend-testing` = implementation: write or repair API/service/database/fixture/contract coverage
- `debugging` = diagnosis: reproduce, isolate, and verify failures or flake causes
- `code-review` = judgment: assess whether a specific diff is safe, convincing, and ready
- `performance-optimization` = measurement-led tuning: classify the bottleneck mode, choose the right evidence source, recommend one or two high-leverage changes, and verify before/after impact

## Why it matters
- Trigger precision improves when policy, implementation, diagnosis, and review are not collapsed into one generic testing/debugging skill.
- Modernization work compounds: strengthening one anchor skill makes the next boundary easier to define.
- Discovery docs are enough to steer activation, but only if the canonical anchors have clear one-line roles.

## Boundary rules
- If the question is **"how do we clean this structure up without changing behavior?"** → `code-refactoring`
- If the question is **"what should we test?"** → `testing-strategies`
- If the question is **"how do we implement those backend tests?"** → `backend-testing`
- If the question is **"why is this test or system failing?"** → `debugging`
- If the question is **"is this diff/PR ready?"** → `code-review`
- If the question is **"where is the bottleneck and what should we tune?"** → `performance-optimization`

## Structural note
The latest graph refresh strengthened the same pattern already visible after `debugging`, `code-review`, and `testing-strategies`: improving a legacy anchor with support files is more valuable than creating another wrapper skill in the code-quality lane. `code-refactoring` now fills the structural-cleanup role and `performance-optimization` now fills the measurement-led tuning role, which makes the cluster read more cleanly as cleanup → policy → implementation → diagnosis → judgment → tuning.

The 2026-04-18 `debugging` structural-hardening pass confirmed the next ratchet after support coverage reaches 100%: shrink the front door, keep the diagnosis loop centered on reproduce → isolate → verify, move case-specific packets into references, and sync compact/discovery surfaces so the cluster boundaries stay truthful under pressure.

The 2026-04-18 `performance-optimization` structural-hardening pass extended the same rule to tuning work: the durable win was not another performance wrapper, but an artifact-first front door that starts from traces, CWV reports, query plans, benchmark diffs, or profiler captures, then routes to observability, debugging, refactoring, testing policy, or engine-specific profiling only after one bottleneck is named.

## Related pages
- [[skill-support-coverage]]
- [[backend-api-cluster]]
- [[debugging-modernization-2026-04-13]]
- [[debugging-structural-hardening-2026-04-18]]
- [[code-review-modernization-2026-04-13]]
- [[testing-strategies-modernization-2026-04-13]]
- [[code-refactoring-modernization-2026-04-14]]
- [[performance-optimization-modernization-2026-04-14]]
- [[performance-optimization-structural-hardening-2026-04-18]]
