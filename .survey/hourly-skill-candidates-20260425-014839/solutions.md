# Solution Landscape: hourly skill candidates 2026-04-25

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| LeCoupa/awesome-cheatsheets | repo discovery candidate | recent activity + license + non-archived | broad keyword/seed may still require manual fit check | license=mit, archived=False, pushed=2026-04-12T17:26:10Z |
| cli/cli | repo discovery candidate | recent activity + license + non-archived | broad keyword/seed may still require manual fit check | license=mit, archived=False, pushed=2026-04-24T13:54:31Z |
| payloadcms/payload | repo discovery candidate | recent activity + license + non-archived | broad keyword/seed may still require manual fit check | license=mit, archived=False, pushed=2026-04-24T16:38:37Z |
| vuejs/vue-cli | repo discovery candidate | recent activity + license + non-archived | broad keyword/seed may still require manual fit check | license=mit, archived=False, pushed=2025-08-21T10:56:30Z |
| angular/angular-cli | repo discovery candidate | recent activity + license + non-archived | broad keyword/seed may still require manual fit check | license=mit, archived=False, pushed=2026-04-24T08:07:52Z |
| googleworkspace/cli | repo discovery candidate | recent activity + license + non-archived | broad keyword/seed may still require manual fit check | license=apache-2.0, archived=False, pushed=2026-04-22T21:19:10Z |
| davila7/claude-code-templates | repo discovery candidate | recent activity + license + non-archived | broad keyword/seed may still require manual fit check | license=mit, archived=False, pushed=2026-04-24T04:07:47Z |
| urfave/cli | repo discovery candidate | recent activity + license + non-archived | broad keyword/seed may still require manual fit check | license=mit, archived=False, pushed=2026-04-18T18:48:23Z |

## Categories
- Agentic tooling
- Web frontend/backend frameworks
- CLI open-source utilities
- Game development engines/toolchains

## What People Actually Use
- Cron-friendly GitHub-native retrieval with explicit metadata gates is reliable. (direct page retrieval)
- Sparse lanes benefit from seed-recovery queries, then same relevance gate.

## Frequency Ranking
1. GitHub-native discovery + metadata gating
2. Seed-recovery for sparse lanes
3. Cross-lane dedupe before recommendation

## Key Gaps
- Exact-keyword lanes can return zero results without rescue queries.
- High-star repos can still be low-fit without explicit rationale checks.

## Contradictions
- Popularity (stars) correlates with visibility, not guaranteed skill-maintenance relevance.
- Niche but active repos may score lower on stars yet fit the task better.

## Key Insight
Use five mandatory keyword lanes for breadth, then enforce metadata minimum and seed-recovery only for sparse lanes to keep precision under hourly automation. (direct page retrieval)
