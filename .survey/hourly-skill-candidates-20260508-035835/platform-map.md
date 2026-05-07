# Platform Map: hourly skill candidate survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search source | GH search | GH search | GH search | lane queries + recovery |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance required | yes | yes | yes | validator labels in markdown |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly cron | supported | supported | supported | open-PR-first hard gate |

## Platform Gaps
1. no-checks-reported branches block merge automation until CI/check policy is enabled.
