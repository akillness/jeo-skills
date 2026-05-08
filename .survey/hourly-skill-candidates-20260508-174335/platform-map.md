# Platform Map: oh-my-skills survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey lanes | supported | supported | supported | gh search repos |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Lane contract | must enforce | must enforce | must enforce | validator script |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly cron | yes | yes | yes | evidence+validator |

## Platform Gaps
1. Missing CI checks means merge is blocked even when artifacts are valid.
