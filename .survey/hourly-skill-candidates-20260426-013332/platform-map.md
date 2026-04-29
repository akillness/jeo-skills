# Platform Map: hourly survey skill maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact contract | markdown artifacts + validator | 동일 | 동일 | `.survey/{slug}` 고정 파일/헤딩 |
| Provenance labels | validator 허용 라벨 사용 | 동일 | 동일 | `indexed snippet`, `direct page retrieval` 등 표준 라벨 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Keyword lanes | 5개 lane 필수 실행 | 동일 | 동일 | agentic/frontend/backend/cli/game 고정 |
| Degraded reporting | lane_status + degraded_causes | 동일 | 동일 | pass/degraded + taxonomy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR validation | validator + diff check | 동일 | 동일 | 실패 시 merge 금지 |
| PR review log | self-review comment | 동일 | 동일 | 체크리스트 기반 증적 남김 |

## Platform Gaps
1. 검색 API/도구 품질 편차가 커서 lane별 recovery와 provenance 라벨링 전략을 공통 규칙으로 강제해야 한다.
2. 무인 크론 환경에서는 모호한 자연어 규칙보다 정량 트리거(raw_count/kept_count/zero-star 비율)가 필요하다.

- Provenance labels used: indexed snippet, direct page retrieval
