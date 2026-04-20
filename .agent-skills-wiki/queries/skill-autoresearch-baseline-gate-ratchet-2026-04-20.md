---
title: Skill Autoresearch baseline gate ratchet 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/skill-autoresearch-baseline-gate-ratchet-20260420/triage.md, .survey/skill-autoresearch-baseline-gate-ratchet-20260420/context.md, .survey/skill-autoresearch-baseline-gate-ratchet-20260420/solutions.md, .survey/skill-autoresearch-baseline-gate-ratchet-20260420/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Skill Autoresearch baseline gate ratchet 2026-04-20

## Decision
The best bounded next improvement for `skill-autoresearch` was not another evaluator surface or broader platform comparison. It was to make the front door decide earlier whether a ratchet is justified at all.

## Why this won
- Survey evidence still showed that Promptfoo, LangSmith, Braintrust, Weave, and benchmark frameworks help with experiments and comparisons, but none of them natively solve the repo-local policy question: **should this artifact enter mutation mode right now?**
- Real operator behavior is still hybrid and manual: small frozen golden sets, local scripts, PR/git logs, and selective hosted dashboards. That makes an explicit `no ratchet justified` outcome more valuable than another feature tour.
- The existing `skill-autoresearch` baseline already preserved frozen evaluators, one-change mutation, route-outs, and append-only keep/revert memory. The missing contract was a first-class ratchet-eligibility gate and a clearer support-sync-only path.

## Accepted changes
- Added `ratchet-eligibility` as a first-class packet in `skill-autoresearch/SKILL.md` and `SKILL.toon`.
- Made `no ratchet justified` an explicit valid outcome before charter/baseline/mutation work.
- Clarified that support-surface drift can route directly to `support-sync` when the main artifact is already good.
- Expanded `evals/evals.json` with a no-ratchet case and stronger support-sync expectations.
- Updated `references/run-packets-and-route-outs.md`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces advertise the tighter contract.

## Rejected changes
- Adding another benchmark helper or hosted-eval abstraction.
- Turning this run into a broader rewrite of `autoresearch`, LangSmith, Promptfoo, or repo-wide eval infrastructure.
- Treating support-sync or doc drift as proof that the main artifact always needs another mutation loop.

## Durable boundary
Use `skill-autoresearch` when the job is a repo-local artifact ratchet with a frozen judge and append-only keep/revert memory.
Start by deciding among:
- `no ratchet justified`
- `support-sync`
- a real benchmark loop

Do not default to mutation just because improvement feels possible.

## Related pages
- [[search-analysis-cluster]]
- [[skill-autoresearch-structural-hardening-2026-04-19]]
- [[autoresearch-structural-hardening-2026-04-18]]
- [[langsmith-structural-hardening-2026-04-19]]
