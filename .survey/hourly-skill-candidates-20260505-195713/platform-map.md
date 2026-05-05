# Platform Map: oh-my-skills hourly loop

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey lanes | yes | yes | yes | gh search repos |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| provenance labels | required | required | required | validator --require-provenance |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| PR checks gate | block on no checks reported | block | block | same policy |

## Platform Gaps
1. GitHub checks 미보고 시 자동 merge 불가