# Platform Map: hourly-skill-candidates

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Hourly trigger | Cron/scheduler prompt | Cron/scheduler prompt | Cron/scheduler prompt | Fixed five-lane survey policy |
| Evidence storage | `.survey/{slug}/` artifacts | `.survey/{slug}/` artifacts | `.survey/{slug}/` artifacts | Canonical artifact folder |
| Provenance labels | Validator-approved labels | Validator-approved labels | Validator-approved labels | `indexed snippet`/`direct page retrieval`/`feed recovery` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Required lanes | Must run 5 keyword families | Must run 5 keyword families | Must run 5 keyword families | Same lane contract |
| Recommendation gates | license + freshness + signal + fit | license + freshness + signal + fit | license + freshness + signal + fit | Shared reviewer gate |
| Degraded reporting | lane_status + degraded_causes | lane_status + degraded_causes | lane_status + degraded_causes | Shared taxonomy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | Tool-assisted search | Tool-assisted search | Tool-assisted search | Survey-first evidence |
| Validation | Artifact validator + diff check | Artifact validator + diff check | Artifact validator + diff check | Merge only on green gates |
| PR lifecycle | Create/comment/merge by CLI | Create/comment/merge by CLI | Create/comment/merge by CLI | Self-review checklist required |

## Platform Gaps
1. GitHub API payload shape differences (license fields) can cause cross-run inconsistency without explicit normalization.
2. Sparse-lane recovery quality differs by query language and search backend behavior.
3. Tooling availability (RTK/Graphify/Obsidian CLI) varies per runtime, requiring deterministic fallback paths.
