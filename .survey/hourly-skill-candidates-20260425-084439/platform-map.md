# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| 주기 실행 | scheduler prompt 기반 | cron + Hermes 런타임 | scheduler/automation | hourly keyword sweep + evidence artifacts |
| 검색 소스 | web_search 실패 시 fallback 필요 | gh search/repos API 사용 가능 | 검색 API 편차 존재 | GitHub-native retrieval 우선 fallback |
| 결과 저장 | markdown/json 아티팩트 | markdown/json 아티팩트 | markdown/json 아티팩트 | `.survey/<slug>/` 고정 스키마 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| 필수 키워드 | 5개 패밀리 강제 | 5개 패밀리 강제 | 5개 패밀리 강제 | lane coverage contract |
| 품질 게이트 | validator + provenance | validator + provenance | validator + provenance | `validate_survey_artifacts.py --platform-topic --require-provenance` |
| 병합 조건 | 게이트 실패시 no-merge | 게이트 실패시 no-merge | 게이트 실패시 no-merge | fail-closed merge policy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| pre-PR | 조사 결과 요약/정리 | 조사 결과 요약/정리 | 조사 결과 요약/정리 | RTK summary + Graphify refinement |
| post-change | validator 실행 | validator 실행 | validator 실행 | artifact contract check |
| merge gate | self-review checklist | self-review checklist | self-review checklist | quality gate + risk/rollback explicit |

## Platform Gaps
1. web_search 인증/레이트리밋 오류 시 플랫폼별 우회 난이도가 다르다.
2. Obsidian CLI/LLM-Wiki 바이너리 가용성 편차가 있어 파일 직접 쓰기 fallback이 필요하다.
3. Graphify 쿼리 스키마(`links` vs `edges`) 차이로 저장 경로 fallback을 준비해야 한다.
