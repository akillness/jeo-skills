---
title: Autoresearch Hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, trigger-design, skill-quality, search-analysis]
sources: [.survey/autoresearch-hardening-20260416/triage.md, .survey/autoresearch-hardening-20260416/context.md, .survey/autoresearch-hardening-20260416/solutions.md]
---

# Autoresearch Hardening 2026-04-16

## Question
What is the best bounded next improvement for the repo's `autoresearch` lane after merging the `skill-autoresearch` hardening PR?

## Answer
Harden `autoresearch` in place instead of broadening it into a generic eval or self-improvement skill. The durable move is to make the ML-specific boundary unmistakable: human-written `program.md`, agent-edited `train.py`, immutable harness in `prepare.py`, fixed 300-second GPU runs, and `val_bpb` keep/revert ratcheting.

## Why this beat alternatives
- The support-gap scan showed `autoresearch` still lacked `evals/evals.json` even though it is a README-visible search-analysis anchor.
- The survey showed the biggest confusion risk is not missing coverage, but overlap with `skill-autoresearch` and hosted eval platforms.
- Upstream repo inspection also exposed stale local assumptions such as references to `constants.py` even though the current upstream structure centers the immutable harness in `prepare.py`.
- A bounded support-and-boundary hardening pass is more useful than adding another prompt/app eval wrapper.

## Accepted changes
- Sharpen `autoresearch` trigger language around Karpathy-style ML experiments only.
- Add `evals/evals.json` covering ML trigger fit, route-out clarity, and immutable-harness discipline.
- Refresh reference docs so they match the current upstream file structure and stop claiming the setup script automatically scales `EVAL_TOKENS`.
- Refresh compact/discovery/docs surfaces to make the ML-vs-skill-autoresearch split visible.

## Rejected changes
- Broadening `autoresearch` into prompt evaluation, app observability, or generic repo-local skill optimization.
- Spawning another overlapping autoresearch wrapper.
- Treating hosted eval platforms as substitutes for the fixed-budget training-loop lane.

## Durable boundary
If the job is **autonomous ML training search on a real repo with `program.md`, `train.py`, GPU budgets, and `val_bpb`**, use `autoresearch`.
If the job is **optimizing a `SKILL.md` or other repo-local instruction artifact with frozen prompts/evals**, use `skill-autoresearch`.
If the job is **LLM app evaluation, tracing, or prompt CI**, route to a dedicated eval/observability platform instead of stretching this skill.

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[skill-autoresearch-hardening-2026-04-16]]
