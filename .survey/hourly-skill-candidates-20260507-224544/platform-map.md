# Platform Map: oh-my-skills hourly maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Artifact schema | 지원 | 지원 | 지원 | validator 우선 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | 준수 | 준수 | 준수 | --require-provenance |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| PR gating | checks 확인 | checks 확인 | checks 확인 | no-checks 차단 |

## Platform Gaps
1. graphify/obsidian CLI가 환경마다 부재 가능
