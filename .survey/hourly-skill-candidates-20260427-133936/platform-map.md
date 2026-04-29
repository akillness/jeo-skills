# Platform Map: oh-my-skills survey maintenance loop

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Evidence artifact output | Writes `.survey/<slug>/` markdown + JSON | Same artifact contract in repo automation | Same artifact contract expected | Fixed headings + validator script |
| Provenance labels | Validator-compatible labels required | Same | Same | `indexed snippet` / `direct page retrieval` set |
| Hourly lane policy | Five mandatory keyword families | Same | Same | Deterministic lane metrics + status fields |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Promotion quality gate | license + freshness + signal + fit | Same | Same | Recommendation-grade strictness, raw evidence retention |
| New hardening rule | Add negation-aware lane-intent guard | Add same guard text | Add same guard text | Shared survey SKILL.md + SKILL.toon rules |
| Degraded reporting | lane_status + degraded_causes | Same | Same | Reviewer-readable trend metrics |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly trigger | cron/orchestrator run | cron/orchestrator run | cron/orchestrator run | Same branch/PR lifecycle |
| Validation hook | survey validator + diff checks | same checks | same checks | quality gate before merge |
| Merge decision | merge only on green gates | same | same | non-destructive PR with rollback note |

## Platform Gaps
1. Semantic negation handling is not explicitly codified in current lane-intent gate text.
2. Without shared negation wording, different maintainers may apply manual overrides inconsistently.
