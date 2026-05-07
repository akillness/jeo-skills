# Platform Map: oh-my-skills survey stack

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey evidence | N/A | gh search repos | N/A | indexed snippet provenance |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gating | checks required | checks required | checks required | no checks -> merge block |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly loop | N/A | branch->PR->checks | N/A | validator strict flags |

## Platform Gaps
1. carry-forward PR에 checks 미보고가 반복되면 merge cadence가 급격히 저하됨.
