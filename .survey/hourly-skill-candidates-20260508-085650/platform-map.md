# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey lanes | yes | yes | yes | five required lane families |
| Evidence provenance | yes | yes | yes | validator accepted labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Open PR hard gate | enforce | enforce | enforce | no new PR while open PR exists |
| Merge gate | enforce | enforce | enforce | merge only with checks green |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | search repos | search repos | search repos | staged recovery lanes |
| Validation | run validators | run validators | run validators | strict heading and provenance checks |

## Platform Gaps
1. Missing PR checks prevent autonomous merge despite valid artifacts.
