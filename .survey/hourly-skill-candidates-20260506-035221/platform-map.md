# Platform Map: Hourly Skill Candidate Sweep

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey Querying | GitHub search/API | GitHub search/API | GitHub search/API | indexed snippet provenance |
| Artifact Validation | survey validator | survey validator | survey validator | --platform-topic --require-provenance |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory lanes | 5 lanes 고정 | 5 lanes 고정 | 5 lanes 고정 | 동일 lane policy 적용 |
| Promotion gate | token/signal/freshness | token/signal/freshness | token/signal/freshness | negation-aware + low-fit 분류 |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR | evidence 생성 | evidence 생성 | evidence 생성 | lane metrics integrity |
| Pre-merge | checks 확인 | checks 확인 | checks 확인 | green-only merge |

## Platform Gaps
1. 검색 API의 license 필드 shape 불일치가 품질 판단 노이즈를 유발한다.
2. lane별 결과 밀도 차이로 인해 동일 임계치가 특정 lane에 과도한 불이익을 줄 수 있다.
