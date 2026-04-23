# Platform Map: oh-my-skills hourly candidate scan

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Web search key availability | `web_search` key 누락 시 실패 가능 | 동일 | 동일 | 실패 시 GitHub search URL + repo API fallback |
| TLS validation in runner | 일부 환경에서 cert chain 실패 가능 | 동일 | 동일 | 메타데이터 조회에 한해 unverified SSL fallback + 리스크 명시 |
| Repo metadata retrieval | gh/REST 혼용 가능 | gh/REST 혼용 가능 | gh/REST 혼용 가능 | stars/license/archived/pushed_at 재검증 필수 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| 필수 키워드 5종 조사 | 동일 | 동일 | 동일 | 5개 키워드 링크를 산출물에 모두 명시 |
| CLI OSS 최소 3개 | 동일 | 동일 | 동일 | 이름/링크/라이선스/적용 아이디어 포함 |
| backlog 우선 처리 | 동일 | 동일 | 동일 | 직전 미처리 항목을 먼저 반영 후 신규 조사 |
| PR 단위 변경 관리 | 동일 | 동일 | 동일 | 품질 게이트 실패 시 merge 금지(open 유지) |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-research | `.survey`와 survey skill 문서 선검토 | 동일 | 동일 | triage/context/solutions/platform-map 계약 준수 |
| Post-research | artifact validator 실행 | 동일 | 동일 | `--platform-topic --require-provenance` 통과 |
| PR gate | 검증 결과 기반 merge 판정 | 동일 | 동일 | pass 전에는 절대 merge 금지 |

## Platform Gaps
1. 검색 API 인증 누락 시 기본 검색 경로가 즉시 실패한다.
2. 샌드박스 TLS 신뢰 저장소 차이로 HTTPS 검증 실패가 간헐적으로 재현된다.
3. 키워드 검색 결과 품질 편차가 커서 수동 필터링(라이선스/활동성)이 반드시 필요하다.
