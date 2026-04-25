# Hourly survey open-PR backlog gate

## Context
- Run slug: `hourly-skill-candidates-20260426-081527`
- Trigger: hourly cron maintenance for `akillness/oh-my-skills`.
- Observation: multiple open hourly PRs are accumulating, increasing review latency and duplicate change risk.

## Evidence
- Survey artifacts: `.survey/hourly-skill-candidates-20260426-081527/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260426-081527/rtk-summary.md`
- Graphify fallback graph: `.survey/hourly-skill-candidates-20260426-081527/graphify-refined.json`
- GitHub PR listing (`direct page retrieval`): open PR backlog was non-empty during this run.

## Insight
- Add a lightweight backlog gate in the hourly loop: when open hourly PRs exceed threshold, prioritize low-risk docs-only hardening and avoid expansive multi-skill churn.
- Keep survey-first evidence collection unchanged; only adapt implementation scope by backlog pressure.

## Follow-up
- This run applies one new-skill addition + one small survey-loop hardening change as bounded scope.
