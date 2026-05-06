# Platform Map: hourly skill candidate survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey evidence | JSON artifact | JSON artifact | JSON artifact | .survey/<slug>/evidence.json |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance | required label | required label | required label | --require-provenance validator |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly run | cron | cron | cron | backlog preflight + merge gate |

## Platform Gaps
1. checks 미보고 시 자동 머지 불가
