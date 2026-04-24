# Platform Map: survey skill update relevance gate

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| 검색 도구 가용성 | web_search/web_extract 실패 가능 | 동일 | 동일 | 실패 시 GitHub API 직접 조회 fallback |
| 출력 아티팩트 위치 | `.survey/{slug}` | `.survey/{slug}` | `.survey/{slug}` | 동일한 파일 계약 유지 |
| 근거 라벨 | provenance 명시 가능 | provenance 명시 가능 | provenance 명시 가능 | `direct page retrieval` 등 고정 라벨 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| 스킬 업데이트 절차 | survey 선행 후 개선 | survey 선행 후 개선 | survey 선행 후 개선 | 검색 기반 근거 없는 편집 금지 |
| 후보 선별 | 수동 판단 비중 큼 | 수동 판단 비중 큼 | 수동 판단 비중 큼 | 메타데이터 게이트를 스킬에 명문화 |
| 품질게이트 | validator 실행 | validator 실행 | validator 실행 | `validate_survey_artifacts.py` 통과 필수 |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| 조사 시작 | 스킬 로드 + 모드 분류 | 스킬 로드 + 모드 분류 | 스킬 로드 + 모드 분류 | triage/context/solutions/platform-map 생성 |
| 조사 완료 | validator + 요약 | validator + 요약 | validator + 요약 | 구조 검증 후 구현 단계 이동 |
| 실패 처리 | fallback ladder 사용 | fallback ladder 사용 | fallback ladder 사용 | provenance/리스크 표기 후 범위 축소 |

## Platform Gaps
1. 검색 백엔드 실패 시 플랫폼 공통으로 결과 품질이 급락하며, 관련성 판단을 사람이 보정해야 한다.
2. 키워드 매칭만으로는 무관 저장소가 상위 노출될 수 있어 공통 negative-signal 규칙이 필요하다.
3. SSL 검증 문제 환경에서는 메타데이터 조회를 위한 우회가 필요하며, 이 사실을 provenance로 명시해야 한다.