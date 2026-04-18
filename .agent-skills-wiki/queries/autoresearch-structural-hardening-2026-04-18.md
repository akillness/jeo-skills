---
title: Autoresearch Structural Hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify, search-analysis]
sources: [.survey/autoresearch-structural-hardening-20260418/triage.md, .survey/autoresearch-structural-hardening-20260418/context.md, .survey/autoresearch-structural-hardening-20260418/solutions.md, .survey/autoresearch-structural-hardening-20260418/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Autoresearch Structural Hardening 2026-04-18

## Question
What is the best bounded next improvement for `autoresearch` after the earlier boundary hardening pass already made the ML-vs-skill-autoresearch split explicit?

## Answer
Shrink `autoresearch` into a routing-first front door instead of broadening it further. The durable move is to make users pick one operating mode first — setup readiness, `program.md` authoring, bounded run loop, results interpretation, or constrained-hardware adaptation — while keeping the immutable `prepare.py` / 300-second / `val_bpb` contract explicit and pushing heavy detail into focused references and scripts.

## Why this beat alternatives
- `graphify-out/GRAPH_REPORT.md` still listed `autoresearch` on the oversized front-door watchlist even after the earlier boundary pass.
- Support coverage was already complete, so the highest-value move was structural tightening, not adding another support-heavy wrapper.
- The survey confirmed the main confusion set is adjacent eval / observability tooling, not missing Karpathy workflow coverage.
- A bounded front-door rewrite improves trigger clarity and route selection without changing the lane itself.

## Accepted changes
- Rewrite `autoresearch/SKILL.md` around five operating modes instead of a monolithic end-to-end explainer.
- Add `references/operating-modes-and-route-outs.md` as the focused routing/handoff packet.
- Refresh `evals/evals.json` so the eval suite checks mode selection, immutable-harness discipline, low-VRAM adaptation, and the `skill-autoresearch` route-out.
- Sync compact/discovery/docs surfaces so the smaller front door is visible outside the skill folder.
- Refresh graph outputs so the repo’s structural memory records the smaller `autoresearch` front door.

## Rejected changes
- Adding another autoresearch-adjacent wrapper for evals, observability, or literature review.
- Broadening `autoresearch` into generic prompt/app eval infrastructure.
- Leaving the long explainer shape in place just because the skill already had references/evals/scripts.

## Structural result
- `autoresearch/SKILL.md` dropped from 333 lines to 284 lines.
- The graph watchlist no longer shows `autoresearch` in the top oversized front-door entries.
- The durable boundary is now: `autoresearch` owns real `program.md` / `train.py` / `prepare.py` / `val_bpb` ML search; `skill-autoresearch` owns repo-local skill mutation loops; app-level eval/observability stays outside both.

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[autoresearch-hardening-2026-04-16]]
- [[skill-autoresearch-hardening-2026-04-16]]
