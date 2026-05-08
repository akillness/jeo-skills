# Platform Map: hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Evidence schema | manual parsing | scripted parsing | scripted parsing | JSON lane contract |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | enforced | enforced | enforced | validator --require-provenance |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly run | yes | yes | yes | cron + gh search |

## Platform Gaps
1. CI checks missing on active PR branch blocks merge despite good artifact quality.
