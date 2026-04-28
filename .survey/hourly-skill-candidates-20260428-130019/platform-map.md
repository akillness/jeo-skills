# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Automation mode | yes | yes | yes | cron runner |
| Artifacts | md/json | md/json | md/json | .survey/<slug> |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Survey-first | required | required | required | mandatory 5 lanes |
| Merge gate | strict | strict | strict | validate before merge |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| pre-PR | yes | yes | yes | validation + diff checks |
| post-PR | yes | yes | yes | self-review checklist |

## Platform Gaps
1. Search transport availability varies in unattended runs.
2. Graphify query compatibility may require fallback artifact generation.
