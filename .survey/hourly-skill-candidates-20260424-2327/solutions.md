# Solution Landscape: oh-my-skills hourly candidate maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub Search API | 키워드 기반 광범위 후보 탐색 | 빠른 초기 후보 수집 | 노이즈/오탐 혼입 | direct page retrieval |
| Seed repo enrichment | 키워드별 검증된 레포 직접 조회 | 신뢰도 높은 기준선 | 최신 트렌드 누락 가능 | direct page retrieval |
| Relevance gate | 메타데이터/적합도 필터 | 저품질 후보 제거 | 기준이 약하면 주관성 증가 | repo-maintenance 권장 패턴 |
| Survey artifact validator | 구조/근거 레이블 검증 | 산출물 일관성 확보 | 전략 품질은 별도 판단 필요 | validate_survey_artifacts.py |

## Categories
- Discovery: 키워드 검색, 시드 레포 수집
- Verification: 메타데이터 검증(license/pushed_at/archived)
- Selection: 신규안/개선안 분리 + 중복 체크
- Execution: 소규모 가역 변경 + PR 리뷰/머지

## What People Actually Use
- `web_search` 실패 시 GitHub API fallback이 실질적 기본 경로로 동작했다.
- 키워드 결과만 사용하면 CLI/backend 카테고리에서 오탐 비율이 높아 seed 보정이 사실상 필수였다.

## Frequency Ranking
1. GitHub API fallback (이번 실행에서 필수)
2. seed repository 보정
3. 수동 relevance gate 적용
4. 스킬 문서 업데이트 후 PR 루프

## Key Gaps
- survey 레퍼런스에 **키워드 sweep용 seed 전략**이 암묵적으로만 존재해 재현성이 낮다.
- 노이즈 제거 기준(예: listicle, archived, NOASSERTION license 처리)이 더 명시적일 필요가 있다.

## Contradictions
- "검색 상위 = 좋은 후보"라는 가정은 실제 결과와 충돌한다.
- 일부 고스타 레포는 스킬화 대상이 아닌 자료 모음/교육용 레포였다.

## Key Insight
- 키워드 탐색을 유지하되, **seed + metadata gate를 강제**해야 시간당 자동 루프에서 후보 품질이 안정화된다.
