# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| survey lanes | supported | supported | supported | 5-lane fixed policy |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| provenance label | required | required | required | validator labels enforced |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| hourly cron | yes | yes | yes | commit/PR/check gate |

## Platform Gaps
1. checks 미보고 브랜치에서 자동 병합 불가
2. 도구별 CLI surface drift 가능
