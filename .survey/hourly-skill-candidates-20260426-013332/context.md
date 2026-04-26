# Context: hourly survey skill maintenance

## Workflow Context
- 5개 필수 키워드 lane을 고정 실행하고, lane별 recovery(stage1/stage2) 후 recommendation-grade keep을 산출.
- provenance는 GitHub 검색 목록은 `indexed snippet`, 저장소 상세 메타데이터 확인은 `direct page retrieval`로 라벨링.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 신규/개선 후보 선별 및 스킬 반영 | Advanced |
| Reviewer | 리스크/검증/롤백 확인 후 머지 결정 | Advanced |
| Cron Operator | 실패 lane 원인 추적 및 재실행 품질 관리 | Intermediate |

## Current Workarounds
1. lane별 raw를 넓게 수집하고, recommendation-grade gate로 keep을 제한한다.
2. raw_count<8 또는 kept_count==0 또는 zero-star 비율 급증 시 recovery query를 1~2단계로 추가한다.
3. under-threshold lane은 `lane_status: degraded` + `degraded_causes`로 공개한다.

## Adjacent Problems
- 특정 lane에서 추천이 비는 경우 보고서 표현이 모호하면, 리뷰어가 '검색 실패인지/노이즈인지'를 구분하기 어렵다.
- 원인 taxonomy가 불완전하면(`no-results` 누락 등) 자동 분류/집계 품질이 떨어진다.

## User Voices
- "후보 탐색은 반드시 survey 검색 기반 근거와 링크가 있어야 한다." — 운영 요구사항
- "검증 실패 시 머지하지 말고 원인/대응안을 남겨야 한다." — 운영 요구사항

- Provenance labels used: indexed snippet, direct page retrieval
