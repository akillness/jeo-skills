# Platform Map: hourly skill survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey source | gh search | gh search | gh search | indexed snippet |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | validator enforces |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly run | cron | cron | cron | artifact + blocker report |

## Platform Gaps
1. no checks reported blocks merge readiness and requires CI bootstrap.
