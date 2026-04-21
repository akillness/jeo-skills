# Loop Charter

## Goal
Improve the practical usefulness and trigger clarity of `looker-studio-bigquery` without widening the skill boundary beyond dashboard/reporting build-out on top of BigQuery.

## Current Baseline
Current `SKILL.md` is a long command/example dump (~472 lines), has no `references/` or `evals/`, and is described tersely in discovery docs. It lacks strong routing guidance about when to use Looker Studio + BigQuery versus adjacent analysis/modeling/ops skills.

## Mutable Artifact
Primary: `.agent-skills/looker-studio-bigquery/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills structure + frontmatter expectations from `skill-standardization`
- Dry-run usefulness for these prompts:
  1. "Build a PM/ops dashboard from BigQuery events with filters, KPI scorecards, and low-cost refreshes."
  2. "Set up a marketing funnel report in Looker Studio on top of BigQuery without burning query cost every page load."
  3. "Decide whether this request belongs in Looker Studio + BigQuery or should route to a different analytics/data skill."
- Support-file threshold: add reusable `references/` and `evals/` if the survey shows durable workflow patterns
- Repo hygiene: if positioning materially changes, update `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`

## Constraints
- One bounded modernization run only
- No new overlapping analytics skill unless evidence clearly justifies it
- Keep claims source-backed in survey artifacts
- Prefer transferable dashboard/build-out guidance over vendor feature dumping

## Tried Already
- Keep: retain `looker-studio-bigquery` as the BI/reporting handoff named in the search-analysis cluster
- Revert: adding another overlapping dashboard/reporting wrapper unless the survey proves a genuine missing lane
