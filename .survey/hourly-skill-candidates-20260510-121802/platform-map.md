# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey evidence format | skill-driven | skill-driven | skill-driven | JSON+markdown contract |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Open PR gate | check first | check first | check first | block duplicate PR |
| Merge gate | green checks only | green checks only | green checks only | hard quality gate |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | gh search | gh search | gh search | mandatory 5 lanes |
| Validation | script gates | script gates | script gates | reproducible artifacts |

## Platform Gaps
1. No CI checks configured for current open PR branch blocks merge automation.
