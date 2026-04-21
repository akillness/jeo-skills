---
title: Skill Autoresearch Hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify, search-analysis]
sources: [.survey/skill-autoresearch-hardening-20260416/triage.md, .survey/skill-autoresearch-hardening-20260416/context.md, .survey/skill-autoresearch-hardening-20260416/solutions.md, .survey/skill-autoresearch-hardening-20260416/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Skill Autoresearch Hardening 2026-04-16

## Question
What is the best bounded next improvement for the repo's `skill-autoresearch` lane after the LangSmith and Ralphmode passes?

## Answer
Harden `skill-autoresearch` in place instead of adding another prompt-eval helper. The durable upgrade is to make the repo-local ratcheting niche explicit: freeze the evaluation harness, mutate one meaningful thing at a time, keep or revert by score, and preserve append-only experiment artifacts that a later maintainer can reuse.

## Why this beat alternatives
- The support-gap scan showed `skill-autoresearch` was still missing `evals/evals.json` even though the maintenance loop increasingly depends on autoresearch discipline.
- The survey showed the real ecosystem split: hosted eval products solve datasets and experiment dashboards well, but they do not replace a repo-local `SKILL.md` mutation loop with durable keep/discard history.
- Adding another benchmark/eval wrapper would blur the lane with Promptfoo/LangSmith-style tooling instead of clarifying the repo's own maintenance workflow.
- The graph refresh showed the remaining gaps are now mostly narrow holdouts, so strengthening this existing search-analysis anchor had better leverage than creating something new.

## Accepted changes
- Rewrite `skill-autoresearch` around the frozen-evaluator / keep-or-revert mental model.
- Add `references/loop-charter-template.md` so the fixed evaluation harness becomes part of the reusable support layer.
- Add `evals/evals.json` covering benchmark drift, one-change-per-iteration discipline, and support-surface sync timing.
- Refresh `SKILL.toon`, `skills.json`, README catalog copy, and setup-prompt discovery wording so the sharper boundary is visible.

## Rejected changes
- Adding another generic prompt-eval or benchmark helper skill.
- Letting `skill-autoresearch` blur into hosted eval platforms or the GPU-focused `autoresearch` skill.
- Treating multi-file doc/setup churn as the primary change before the main skill boundary was proven.

## Durable boundary
If the job is **improving a reusable markdown skill with a frozen local benchmark and git-friendly artifacts**, use `skill-autoresearch`.
If the job is **running ML experiments on `train.py` with GPU time budgets and `val_bpb`**, use `autoresearch`.
If the job is **hosted prompt/app evaluation or production experiment comparison**, route to external eval platforms instead of broadening this skill.

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[langsmith-hardening-2026-04-16]]
- [[ralphmode-hardening-2026-04-16]]
