---
title: Skill Autoresearch Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, trigger-design, skill-quality, search-analysis]
sources: [.survey/skill-autoresearch-structural-hardening-20260419/triage.md, .survey/skill-autoresearch-structural-hardening-20260419/context.md, .survey/skill-autoresearch-structural-hardening-20260419/solutions.md, .survey/skill-autoresearch-structural-hardening-20260419/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Skill Autoresearch Structural Hardening 2026-04-19

## Question
What is the best bounded next improvement for the existing `skill-autoresearch` lane now that support coverage is already complete and the remaining value is dense-anchor cleanup rather than another eval wrapper?

## Decision
Harden `skill-autoresearch` in place as a **packet-first repo-local ratcheting front door**.

The winning move was not another benchmark helper, another prompt-evals wrapper, or a broader hosted-eval abstraction. The useful ratchet was to make the skill start from one packet:
- `benchmark-readiness`
- `charter-freeze`
- `baseline-score`
- `one-change-mutation`
- `support-sync`
- `final-report`
- `route-out`

Then keep hosted dashboards, traces, and GPU-bound `autoresearch` work outside the markdown/git maintenance boundary.

## Why this won
- Survey evidence still showed a gap between repo-local artifact ratchets and hosted prompt/app evaluation tools. Promptfoo, LangSmith, Braintrust, and Weave all help, but none of them naturally own the git-visible keep/revert narrative for `SKILL.md` plus compact/docs/manifests.
- The graph layer still had `skill-autoresearch` on the oversized front-door watchlist, so the best bounded win was shrinking the entry surface rather than adding support folders or another nearby skill.
- The maintenance loop now depends on this skill often enough that its own route-outs and self-application rule needed to be explicit.

## Accepted changes
- Rewrote `skill-autoresearch/SKILL.md` around packet choice, frozen-harness discipline, and repo-local route-outs.
- Added `references/run-packets-and-route-outs.md` to hold verbose packet detail and keep the front door smaller.
- Expanded `evals/evals.json` with hosted-platform and self-application coverage.
- Synced `SKILL.toon`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`.
- Updated search-analysis wiki guidance so the cluster now treats `skill-autoresearch` as the repo-local ratchet anchor distinct from LangSmith and ML `autoresearch`.

## Rejected changes
- Creating another prompt-eval or benchmark wrapper.
- Expanding `skill-autoresearch` into hosted observability or production tracing guidance.
- Blurring the boundary with GPU-bound `autoresearch`.
- Doing doc/manifests churn before the main skill wording was justified.

## Durable boundary
If the job is **improving a reusable repo artifact with a frozen local benchmark and append-only keep/revert memory**, use `skill-autoresearch`.
If the job is **running ML experiments on `program.md` / `train.py` with `val_bpb`**, use `autoresearch`.
If the job is **hosted prompt/app evaluation with traces, datasets, or dashboards**, route outward.

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[skill-autoresearch-hardening-2026-04-16]]
- [[autoresearch-structural-hardening-2026-04-18]]
- [[langsmith-structural-hardening-2026-04-19]]
