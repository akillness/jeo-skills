# Platform Map: hourly skill survey maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey cadence | hourly | hourly | hourly | cron |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | validator |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR checks | run | run | run | gh pr checks |

## Platform Gaps
1. no checks reported 상태에서는 merge gate를 통과할 수 없다.
