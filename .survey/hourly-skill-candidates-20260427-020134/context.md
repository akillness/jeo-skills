# Context: oh-my-skills hourly survey

## Workflow Context
- Hourly cron run executes five required keyword families and applies relevance/freshness/signal gating.
- This run produced an empty backend lane after recovery (`raw_count=0`), so degraded-cause reporting must explicitly include `no-results`.
- Provenance labels used: indexed snippet, direct page retrieval.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| agentic ai skill | hourly lane sweep + gate | maintainer | raw=30, kept=3 |
| web frontend skill | hourly lane sweep + gate | maintainer | raw=4, kept=0 |
| web backend skill | hourly lane sweep + gate | maintainer | raw=0, kept=0 |
| cli open source skill | hourly lane sweep + gate | maintainer | raw=1, kept=1 |
| game development skill | hourly lane sweep + gate | maintainer | raw=30, kept=1 |

## Current Workarounds
1. Manual visual checks to confirm empty-lane conditions and explain why a lane stayed degraded.
2. Ad-hoc reviewer notes when `raw_count==0` appears after recovery.
3. Manual recomputation of recommendation coverage from evidence files.

## Adjacent Problems
- Recommendation concentration can look healthier than it is without explicit raw-vs-dedup coverage metrics.
- Taxonomy drift causes inconsistent degraded-cause terms across hourly runs.

## User Voices
- "No cross-lane duplicate detected in this run (raw duplicate count=0, kept duplicate count=0)." — indexed snippet
- "Backend lane remained empty after recovery and needs deterministic `no-results` labeling." — indexed snippet
