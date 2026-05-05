# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey evidence | markdown/json artifact | markdown/json artifact | markdown/json artifact | .survey/<slug>/evidence.json |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance label | required | required | required | validator labels only |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| hourly run | survey + PR | survey + PR | survey + PR | validator + checks gate |

## Platform Gaps
1. checks 미보고 브랜치에서는 자동 병합 판단이 불가하다.
2. Graphify/RTK 도구 버전 차이로 fallback 문서 생성이 필요할 수 있다.
