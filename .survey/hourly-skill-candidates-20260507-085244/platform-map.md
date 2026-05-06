# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact schema | 지원 | 지원 | 지원 | `.survey/<slug>/` 계약 고정 |
| Provenance labels | 지원 | 지원 | 지원 | validator 허용 라벨 사용 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Required lanes | 5 lane 실행 | 5 lane 실행 | 5 lane 실행 | 동일 키워드 패밀리 |
| Merge gate | checks green 필요 | checks green 필요 | checks green 필요 | no checks = merge block |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Preflight | PR backlog/checks 샘플 | 동일 | 동일 | backlog-aware 분기 |
| Validation | survey validator | 동일 | 동일 | strict flags 사용 |

## Platform Gaps
1. GitHub checks 미구성 시 플랫폼 무관하게 자동 merge 불가.
2. 검색 노이즈 수준 차이로 lane별 회복 쿼리 의존도 상승.
