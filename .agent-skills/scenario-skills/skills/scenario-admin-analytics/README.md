# Maintainer notes

## Evidence and design

The workflow is grounded in the public
[usage tool reference](https://mcp.scenario.com/docs/tools/usage) and the deployed MCP catalog
schema. Live read-only validation covered project defaults, explicit project filters, team scope,
single-user filters, time buckets, and activity offsets. Disjoint project totals and per-user totals
reconciled to team consumption and every model's CU, API-key CU, and job counts.

The verified accounting contract uses consumption `value` and model point `cost`, both already after
discounts. Raw consumption `total` includes discounts. Inclusive timestamp bounds replace the
draft's incorrect exclusive-end assumption. Zero-discount live samples do not prove discount
arithmetic; synthetic nonzero-discount and negative fixtures exercise that documented contract.
Version 2 invalidates the draft's cache format.

The catalog fallback matters when a connected host retains an older direct tool signature after
deployment. It stays within MCP. User-filtered usage replaces the draft's job-history workaround and
supports both CU and jobs without inferring a joint distribution from marginal totals.

All live customer snapshots and reports stay outside this public repository. Fixtures contain
fictional identifiers and values. Host fallbacks are tested as document-only plans, not live
certification of every CLI or desktop product.

## Validation

The [committed validation evidence](../../tests/scenario-admin-analytics/evidence/README.md) records
the live application result and provides screenshots, a PDF, a dashboard, and CSV exports rendered
from a reproducible fictional dataset. Public examples contain no live customer data.

The baseline planner without the skill lacked executable discovery, cache, and joint-ranking
procedures. Application testing gives a fresh agent only this skill, the connection skill, and a
task, then grades the exact call plan against the fresh public tool schema. The deployed-contract
plan passed scope, stale-schema routing, inclusive dates, discount accounting, complete user
matrices, cache invalidation, and desktop fallback checks. Re-run after substantive contract
changes.

`python3 -B -m unittest discover -s tests/scenario-admin-analytics` exercises the offline helper,
accounting, cache isolation, scope/date validation, user coverage, exports, PDF creation, and
dashboard filters. Install the suite's requirements to include PDF checks. Run `pnpm test` and
`pnpm validate` before shipping. Render every PDF page for visual inspection separately from
structural checks.
