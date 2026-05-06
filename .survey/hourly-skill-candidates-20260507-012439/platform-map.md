# Platform Map: hourly skill survey loop

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey lanes | yes | yes | yes | five-lane mandatory |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | validator source of truth |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| preflight | backlog and checks | backlog and checks | backlog and checks | no-checks merge block |

## Platform Gaps
1. gh pr checks가 no checks reported를 반환할 때 자동 merge 불가
