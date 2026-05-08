# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Repo mutation safety | branch discipline | branch discipline | branch discipline | git + gh policy gates |
| Evidence generation | scripted | scripted | scripted | `.survey/<slug>/evidence.json` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Open PR gate | triage existing PR first | triage existing PR first | triage existing PR first | do not create duplicate PR |
| Merge rule | checks green only | checks green only | checks green only | hard gate |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Survey run | scheduled | scheduled | scheduled | hourly cron |
| Validation | required | required | required | validator + diff-check |

## Platform Gaps
1. Missing CI checks on open PR branch causes recurring merge blocks.
2. Need stable utility scripts for compact lane-health reviewer summaries.

Provenance: indexed snippet, thin evidence
