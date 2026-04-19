# Actual Behavior: skill-autoresearch structural hardening

## What People Actually Use
- Repo-local markdown artifacts plus git history when they need durable keep/revert context, as shown by the existing `skill-autoresearch` package (`loop-charter.md`, `results.tsv`, `results.json`, `changelog.md`, `SKILL.md.baseline`) and earlier repo-local survey artifacts.
- Promptfoo-style YAML configs plus manual review; Promptfoo explicitly notes that many teams still get value from reviewing outputs manually rather than relying only on assertions.[Promptfoo configuration guide](https://raw.githubusercontent.com/promptfoo/promptfoo/main/site/docs/configuration/guide.md)
- CSV/JSON/HTML exports for spreadsheet review; Promptfoo documents CSV export specifically for Excel/Google Sheets analysis.[Promptfoo outputs](https://raw.githubusercontent.com/promptfoo/promptfoo/main/site/docs/configuration/outputs.md)
- Hosted experiment naming plus notebook-side organization; LangSmith cookbook guidance still leans on named projects, notebooks, and export flows rather than a single immutable repo-local contract.[LangSmith cookbook](https://raw.githubusercontent.com/langchain-ai/langsmith-cookbook/main/README.md) [Naming test projects](https://raw.githubusercontent.com/langchain-ai/langsmith-cookbook/main/testing-examples/naming-test-projects/naming-test-projects.md)

## Common Workarounds
- Export evaluator output to CSV/JSON/HTML, then inspect elsewhere.
- Use timestamps or ad hoc project names to separate experiment runs.
- Keep baseline snapshots and rationale in repo files because platform UIs do not capture the full mutation narrative.
- Update tool or skill descriptions manually after failure, then rerun the same or similar tests.

## Pain Points With Current Solutions
- Hosted evaluators can still drift or display stale expected outputs; LangSmith has open issues around experiment snapshots and evaluator trace reliability.[LangSmith issue #2430](https://github.com/langchain-ai/langsmith-sdk/issues/2430) [LangSmith issue #1952](https://github.com/langchain-ai/langsmith-sdk/issues/1952) [LangSmith issue #2603](https://github.com/langchain-ai/langsmith-sdk/issues/2603)
- Manual review remains necessary because automated judging is incomplete; that makes frozen-charter discipline more important, not less.[Promptfoo configuration guide](https://raw.githubusercontent.com/promptfoo/promptfoo/main/site/docs/configuration/guide.md)
- Current tools are good at running evals but weaker at preserving the repo-local “why we kept or reverted this exact wording/support change” story.
- Weak trigger descriptions and fuzzy boundaries remain persistent failure modes in reusable skills, including this repo's own maintenance loop.

## Sources
- `.agent-skills/skill-autoresearch/SKILL.md`
- `.survey/skill-autoresearch-hardening-20260416/context.md`
- `.survey/skill-autoresearch-hardening-20260416/solutions.md`
- [Promptfoo configuration guide](https://raw.githubusercontent.com/promptfoo/promptfoo/main/site/docs/configuration/guide.md)
- [Promptfoo outputs](https://raw.githubusercontent.com/promptfoo/promptfoo/main/site/docs/configuration/outputs.md)
- [LangSmith cookbook](https://raw.githubusercontent.com/langchain-ai/langsmith-cookbook/main/README.md)
- [Naming test projects](https://raw.githubusercontent.com/langchain-ai/langsmith-cookbook/main/testing-examples/naming-test-projects/naming-test-projects.md)
- [LangSmith issue #2430](https://github.com/langchain-ai/langsmith-sdk/issues/2430)
- [LangSmith issue #1952](https://github.com/langchain-ai/langsmith-sdk/issues/1952)
- [LangSmith issue #2603](https://github.com/langchain-ai/langsmith-sdk/issues/2603)
