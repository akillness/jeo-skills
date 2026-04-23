# Platform Map: oh-my-skills hourly candidate scan

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| 필수 5개 키워드 검색 | 브라우저 검색 기반 수집 가능 | 동일 | 동일 | 검색 URL 5종 링크를 아티팩트에 명시 |
| 후보 메타데이터 검증 | `gh api`/repo page 재검증 | 동일 | 동일 | stars/license/archived/pushed_at 교차확인 |
| 품질 게이트 merge 정책 | all-pass일 때만 merge | 동일 | 동일 | fail 1개라도 PR open 유지 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| backlog 우선 | 동일 | 동일 | 동일 | open backlog PR 먼저 판정 |
| CLI OSS ≥3 | 동일 | 동일 | 동일 | 이름/링크/라이선스/적용 아이디어 포함 |
| 중복 분류 | 동일 | 동일 | 동일 | 중복=개선안, 미중복=신규안 |
| 근거 링크 첨부 | 동일 | 동일 | 동일 | 제안/변경마다 source URL 명시 |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-research | `.survey` 최신 실행/열린 PR 확인 | 동일 | 동일 | backlog 우선 처리 |
| Post-research | survey artifact validator 실행 | 동일 | 동일 | `--platform-topic --require-provenance` 필수 |
| PR gate | 검증 로그 기반 merge 판정 | 동일 | 동일 | blocker 있으면 merge 금지 |

## Platform Gaps
1. GitHub 키워드 검색은 노이즈가 커서 수동 정제가 필요하다.
2. 카탈로그 동기화 드리프트(`skills.json`/README/setup count mismatch)가 merge 게이트를 반복적으로 막는다.
3. 신규 스킬 추가 시 카탈로그 자동 갱신 루틴 부재로 문서 일관성 비용이 높다.
