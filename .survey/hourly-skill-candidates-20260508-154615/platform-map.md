# Platform Map: Hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search API | gh search repos | gh search repos | gh search repos | GitHub CLI |
| Artifact validation | python validator | python validator | python validator | .agent-skills/survey/scripts |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Open PR gate | do not create new PR when one is open | same | same | mandatory |
| No-checks merge block | post blocker comment and stop merge | same | same | mandatory |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| hourly cron | run survey + artifacts | run survey + artifacts | run survey + artifacts | deterministic report |

## Platform Gaps
1. Missing CI checks on active branch blocks autonomous merge.
2. Lane relevance still needs periodic rule tuning from observed false positives.
