# Solution Landscape: skill-autoresearch baseline gate ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Promptfoo | Repo-local eval CLI/library with metrics, assertions, and CI/CD | Strong local benchmark fit; explicit test-driven framing; easy regression gating | Does not itself own append-only keep/revert narratives or a repo-local no-change gate | Best lightweight comparator for repo-local skill ratchets |
| LangSmith | Hosted evaluation / experiment / annotation platform | Datasets, offline/online evaluation lifecycle, experiment comparison, annotation queues | Hosted platform bias; mutation discipline and repo-local append-only history stay procedural | Strong boundary context, not the whole `skill-autoresearch` answer |
| Braintrust | Experiment-first eval platform with prompts, scorers, local/UI/CI runs, optional hill climbing | Strong experiments and scorer model; local and CI flows exist; hill-climbing can search for improvements | Repo-local “should we mutate at all?” gate is still external; append-only keep/revert remains workflow-owned | Useful comparison because it exposes hill climbing explicitly |
| Weave | Evaluation objects + datasets + scorers + compare/rank workflows | Strong dataset/scorer architecture and run comparison | Heavier experiment platform; not a repo-native ratchet controller | Good reference for structured evaluation inputs/outputs |
| OpenAI Evals | Benchmark framework and benchmark registry | Strong reproducible benchmark framing | Thin on repo-local docs/manifests sync and keep/revert storytelling | Better as a scoring substrate than as a workflow owner |
| karpathy/autoresearch | Mutation/search loop reference with `program.md`, immutable prep, bounded runs, and result tracking | Excellent inspiration for bounded search and keep-best loops | ML-specific; not for repo-local skill/docs maintenance; even upstream keeps `results.tsv` untracked | Route-out boundary remains important |
| Git-native custom loop | Repo-local baseline copy + frozen evals + one-change diff + append-only log | Best control over baseline stop conditions, one-change iterations, and auditability | Requires explicit operator discipline and wrapper instructions | Closest fit for `skill-autoresearch` itself |

## Categories
### Repo-local evaluator + git ratchet
- Promptfoo
- OpenAI Evals / similar local harnesses
- Custom repo-native loop

### Hosted experiment / observability layer
- LangSmith
- Braintrust
- Weave

### Mutation-loop reference systems
- karpathy/autoresearch
- optimizer / hill-climbing features inside hosted platforms

## What People Actually Use
Actual operator behavior still clusters around a hybrid stack:
- a small hand-curated golden set,
- local scripts or a CLI eval harness,
- manual side-by-side inspection,
- PR/changelog/git history for the durable record,
- optional hosted dashboards for comparison and annotation.

That means the biggest structural gap is not “how do we run experiments?” It is “when do we decide not to start another experiment?”

## Frequency Ranking
1. Promptfoo / local eval harnesses for repo-centric regression checks
2. LangSmith / Braintrust / Weave for hosted datasets, comparisons, and annotations
3. OpenAI Evals / benchmark frameworks for reproducible score baselines
4. Karpathy/autoresearch as the conceptual mutation-loop reference, not the direct repo-local solution
5. Fully custom git-native ratchet controllers for teams that need exact keep/revert provenance

## Key Gaps
- **No first-class no-change gate:** comparison platforms help evaluate candidates, but they rarely front-load a `baseline already passes; do not ratchet` decision.
- **One-change discipline is usually procedural:** most tools can compare variants, but few enforce “one meaningful change only” at the workflow contract level.
- **Append-only keep/revert history is strongest in git, not in hosted dashboards:** platforms preserve experiment history, but repo-visible acceptance/revert narratives still live in commit diffs, logs, or PR text.
- **Support-sync remains secondary but easy to overmix:** README/setup/compact/manifests often drift, yet those fixes should happen after the main ratchet is proven rather than replacing the experiment itself.

## Contradictions
- Marketed tooling emphasizes powerful evaluation and experiment features, but operator reality still relies heavily on manual curation, local scripts, and git-visible logs.
- Hosted platforms make comparison easier, but they do not remove the need for a local policy that says when a passing artifact should stay untouched.
- Mutation/hill-climbing features imply “keep improving,” while mature process disciplines in PM/content/game ops often say “stop once the bar is cleared unless there is explicit new evidence.”

## Key Insight
The strongest bounded improvement to `skill-autoresearch` is not another platform-style eval feature. It is a sharper **ratchet-eligibility front door**: measure or inspect the baseline first, explicitly allow the outcome `no ratchet justified`, and only proceed into charter/baseline/mutation/support-sync packets when the current artifact truly fails, a support-sync-only drift exists, or the maintainer has explicit evidence-backed headroom worth pursuing.

## Curated Sources
- Promptfoo Intro — https://www.promptfoo.dev/docs/intro/
- LangSmith evaluation concepts — https://docs.langchain.com/langsmith/evaluation-concepts
- Braintrust create experiments — https://www.braintrust.dev/docs/evaluate/run-evaluations
- Weave evaluations overview — https://docs.wandb.ai/weave/guides/core-types/evaluations
- OpenAI Evals GitHub — https://github.com/openai/evals
- karpathy/autoresearch GitHub — https://github.com/karpathy/autoresearch
- Martin Fowler fitness functions — https://martinfowler.com/bliki/FitnessFunction.html
