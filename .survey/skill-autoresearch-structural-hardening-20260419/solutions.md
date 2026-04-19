# Solution Landscape: skill-autoresearch structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Repo-local markdown ratchet | Freeze prompts/evals, mutate one thing, keep git-visible artifacts | cheapest, auditable in PRs, best for `SKILL.md` and support-file work | manual scoring/logging burden, weak observability, weak team UI | best fit for this repo |
| Promptfoo | local-first OSS eval runner with CI-friendly config | provider-agnostic, config-in-repo, comparison-friendly, CI integration | collaboration and durable experiment governance are lighter | strongest OSS/local-first neighbor |
| LangSmith | hosted eval + tracing + experiment comparison | polished experiment views, tracing, datasets, online/offline evals | platform-heavy, usage billing, more infra for self-hosting | best when app/runtime observability matters |
| Braintrust | code-first eval platform with scoring SDKs | strong eval-native SDK shape, broad model support | public pricing less obvious, platform dependency rises with usage | good code-first hosted neighbor |
| W&B / Weave | tracing-first eval stack inside broader MLOps platform | strong if team already uses W&B, broad tracing + scorer story | more platform-centric, billed as part of wider stack | better for org-scale tracing than small repo ratchets |

## Categories
- **Repo-bounded workflow:** repo-local markdown/autoresearch loops
- **OSS local-first eval runner:** Promptfoo
- **Hosted eval + observability platform:** LangSmith, Braintrust
- **Tracing-first platform with evals attached:** W&B / Weave

## What People Actually Use
In practice, teams mix these layers instead of choosing one. Promptfoo still supports manual review and spreadsheet export, LangSmith examples still lean on named projects and notebooks, and repo maintainers keep local baselines plus changelogs because platform dashboards do not fully preserve the reasoning behind a keep-or-revert decision.

## Frequency Ranking
1. LangSmith
2. Promptfoo
3. Braintrust
4. W&B / Weave
5. Repo-local markdown ratchets

## Key Gaps
- Hosted tools track experiments well but do not automatically preserve repo-local mutation rationale, rejected edits, compact-surface sync, or markdown skill boundary logic.
- Local loops preserve rationale and git truth, but need clearer route-outs, better support packets, and stricter frozen-evaluator discipline.
- The market has many prompt/app eval tools but fewer good patterns for improving reusable markdown skills and SOPs inside a repository.

## Contradictions
- Tools market “evals” as a unified answer, but real practice still exports results into spreadsheets, notebooks, wiki pages, and git history.
- Hosted platforms promise durable comparison, yet open issues still show stale references, missing evaluator traces, or incomplete reruns.
- Local loops feel primitive, but they are often the most trustworthy layer for maintaining skill text, support files, and doc/manifests together.

## Key Insight
The right job for `skill-autoresearch` is not “be another eval platform.” It is to be the **repo-local ratcheting front door** that freezes the evaluator, chooses one mutation packet, keeps or reverts based on repeatable checks, and routes hosted experiment/tracing work outward when the real need is product-scale observability rather than markdown skill maintenance.

## Curated Sources
- [Upstream autoresearch skill](https://github.com/olelehmann100kMRR/autoresearch-skill)
- [Promptfoo README](https://github.com/promptfoo/promptfoo)
- [Promptfoo intro docs](https://github.com/promptfoo/promptfoo-docs/blob/main/docs/intro.md)
- [LangSmith evaluation quickstart](https://github.com/langchain-ai/langsmith-docs/blob/main/docs/evaluation/index.mdx)
- [LangSmith pricing](https://www.langchain.com/pricing)
- [Braintrust Python SDK](https://github.com/braintrustdata/braintrust-sdk-python)
- [Autoevals](https://github.com/braintrustdata/autoevals)
- [Weave README](https://github.com/wandb/weave)
- [Weights & Biases pricing](https://wandb.ai/site/pricing)
