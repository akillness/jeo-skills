# Platform Map: oh-my-skills hourly maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact schema | skill-enforced headings | same validator contract | same validator contract | .survey/{slug} contract |
| Provenance labels | explicit markdown labels | explicit markdown labels | explicit markdown labels | validator-approved labels only |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory 5-lane sweep | required | required | required | deterministic lane health output |
| Merge gate | no merge on failed/absent checks | same | same | quality-gate first |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR validation | artifact validator + diff check | artifact validator + diff check | artifact validator + diff check | shared validation script |
| Post-PR review | self-checklist comment | self-checklist comment | self-checklist comment | structured review notes |

## Platform Gaps
1. Search/tooling reliability differs; GitHub-native retrieval remains the most portable fallback. (provenance: direct page retrieval)
2. Non-interactive cron runs require deterministic degraded-cause taxonomy to avoid ambiguous reports.
