# Context: skill-autoresearch baseline gate ratchet

## Workflow Context
The next `skill-autoresearch` opportunity is not another broader eval wrapper. The recurring problem is earlier in the loop: maintainers often start a ratchet even when the current artifact may already be good enough, or when the real need is only support-surface sync. That same failure mode shows up across developer workflow, web/fullstack delivery, PM/ops, marketing/content operations, and game-production docs: mature systems use a sufficiency gate before more change.

Source-backed anchors used in this run:
- Promptfoo presents itself as an open-source CLI and library for evaluating LLM apps, with metrics, CLI/library/CI usage, and “test-driven LLM development, not trial-and-error.” (`browser-rendered primary page evidence`: https://www.promptfoo.dev/docs/intro/)
- LangSmith’s evaluation docs foreground datasets, offline/online evaluations, evaluation lifecycle, experiment comparison, and annotation queues. (`browser-rendered primary page evidence`: https://docs.langchain.com/langsmith/evaluation-concepts)
- Braintrust’s evaluation docs foreground prompts, scorers, experiments, local/UI/CI execution, and optional hill climbing. (`browser-rendered primary page evidence`: https://www.braintrust.dev/docs/evaluate/run-evaluations)
- Weave’s evaluation docs foreground evaluation objects, datasets, scoring functions, and compare/rank workflows. (`browser-rendered primary page evidence`: https://docs.wandb.ai/weave/guides/core-types/evaluations)
- `karpathy/autoresearch` remains a generate/evaluate/select reference point, with `program.md`, `prepare.py`, `train.py`, and untracked `results.tsv` visible in the upstream repo. (`browser-rendered primary page evidence`: https://github.com/karpathy/autoresearch)
- Fowler’s fitness-function framing and common Definition-of-Done / approval-gate practice still support the same principle: if the baseline already clears the bar, change needs explicit justification rather than momentum.

The repo-local gap is that hosted or benchmark-focused tools help with experiments and comparisons, but they do not naturally decide whether a repo artifact should enter mutation mode at all. `skill-autoresearch` already handles frozen evaluators and keep/revert discipline well; the missing front-door contract is a stronger **ratchet-eligibility / no-ratchet-justified** decision before the loop expands.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill / prompt maintainer | Improve `SKILL.md`, SOPs, prompts, and workflow docs without creating noisy churn | Intermediate to advanced |
| Developer workflow owner | Keep repo-local automation docs and prompts stable under CI / PR review | Intermediate |
| PM / ops maintainer | Decide when checklists, runbooks, and templates actually need another revision | Intermediate |
| Marketing / content operator | Avoid revision thrash once a reusable brief, playbook, or template already clears the bar | Intermediate |
| Game-production lead | Respect milestone / content-lock style gates for reusable planning or launch artifacts | Intermediate |

## Current Workarounds
1. Manual baseline snapshots: keep the current artifact as the champion, test a challenger, and revert unless the challenger clearly wins.
2. Small frozen eval sets: maintain a hand-curated set of representative prompts or scenarios, often built from previous failures.
3. Checklist sufficiency / Definition-of-Done gates: teams stop iterating only when a human reviewer says the artifact is “good enough.”
4. PR- or markdown-based changelogs: use git history as the append-only record because purpose-built tools do not own the whole repo-local workflow.
5. Hosted eval dashboards as inspection layers: use platforms for dataset comparison or scoring, but still do manual triage to decide whether another edit is justified.

Limitations of the current workarounds:
- They usually gate **after** mutation starts, not before.
- The “no change justified” outcome is often implicit rather than a first-class packet.
- Support-sync chores can get mixed with the main experiment and muddy the keep/revert story.

## Adjacent Problems
- Evaluator overfitting: once a small frozen set exists, repeated mutations can improve score without improving broad usefulness.
- Regression risk from unnecessary edits to a passing artifact.
- Reviewer fatigue from low-signal variants.
- Version drift across `SKILL.md`, evals, compact variants, manifests, and README/setup surfaces.
- Cost/control problems when hosted experiment loops or repeated model calls continue without proving there is still worthwhile headroom.
- In production-like workflows (content lock, milestone gates, release readiness), late changes become more expensive than early baseline sufficiency checks.

## User Voices
> “The goal: test-driven LLM development, not trial-and-error.” — Promptfoo Intro (`browser-rendered primary page evidence`: https://www.promptfoo.dev/docs/intro/)

> LangSmith’s evaluation docs emphasize datasets, offline/online evaluation, and “Compare experiment results,” which reinforces comparison-first workflows rather than blind mutation. (`browser-rendered primary page evidence`: https://docs.langchain.com/langsmith/evaluation-concepts)

> Braintrust’s evaluation docs expose “Create experiments,” “Run locally,” “Run in UI,” “Run in CI/CD,” and “Enable hill climbing,” which makes experiments first-class but still leaves repo-local keep/revert policy to the operator. (`browser-rendered primary page evidence`: https://www.braintrust.dev/docs/evaluate/run-evaluations)

> Weave’s evaluation docs expose evaluation objects, datasets, scoring functions, and compare/rank workflows, again supporting measurement but not a native repo-local no-change gate. (`browser-rendered primary page evidence`: https://docs.wandb.ai/weave/guides/core-types/evaluations)

> Fowler: “A fitness function is an objective integrity assessment of some architectural characteristic.” That maps cleanly onto a repo-local ratchet gate: assess the current artifact first, then mutate only if the integrity target is not already satisfied. (https://martinfowler.com/bliki/FitnessFunction.html)
