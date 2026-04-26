# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact contract | same headings required | same headings required | same headings required | validator-enforced markdown templates |
| Provenance labels | validator-compatible labels | validator-compatible labels | validator-compatible labels | indexed snippet/direct page retrieval/thin evidence |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Lane status | pass/degraded + causes | pass/degraded + causes | pass/degraded + causes | same taxonomy + metrics |
| Zero-star saturation guard | required | required | required | downgrade unless explicit traction rationale |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly trigger | cron/job runner | cron/job runner | cron/job runner | one run slug, deterministic artifacts |
| Post-run validation | validator + diff checks | validator + diff checks | validator + diff checks | same quality gate before merge |

## Platform Gaps
1. CLI availability differs (obsidian-cli/rtk/graphify), so fallback file writes are required.
2. Search APIs can degrade by environment; GitHub-native retrieval must remain available.
3. Self-approval constraints on GitHub require checklist comments instead of self-approve review.
