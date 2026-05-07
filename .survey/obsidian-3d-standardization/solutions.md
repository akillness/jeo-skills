## Solution List
1. 최근 3일 신규 스킬 전체를 validator로 일괄 점검
2. `obsidian` SKILL.md 최소 수정:
   - `## Examples` 섹션 추가
   - 하단 중복 `## Instructions`를 `## Operational checklist`로 정규화
   - 보안 주의 문구(원격 generator 실행 전 출처 검증/핀 권고) 추가
   - 404 외부 링크를 공식 저장소 링크로 교체
3. 재검증 및 PR 생성 후 체크 게이트 적용

## Categories
- 문서 표준화
- 보안 가드레일 명확화
- 참조 무결성(link health)

## What People Actually Use
- `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- `curl -I -L` 링크 헬스체크
- `gh pr create`, `gh pr checks`

## Frequency Ranking
1. 섹션/헤더 정규화
2. 링크 갱신
3. 실행 가드레일 문구 보강

## Key Gaps
- 신규 스킬에도 링크 rot가 즉시 발생 가능
- 중복 헤더는 파서/독자 혼란을 유발

## Contradictions
- validator는 통과해도 실링크가 404일 수 있음(추가 점검 필요)

## Key Insight
- 대규모 리팩토링 없이도, 단일 스킬의 작은 구조/보안/링크 수정으로 품질 리스크를 유의미하게 낮출 수 있다.

### Candidate Metadata Gate
- candidate: `.agent-skills/obsidian`
- license: repository-level MIT (`LICENSE`)
- updated/pushed_at: git history 기준 최근 3일 내 신규 추가
- archived: false (active repo)
- fit rationale: 신규 후보 중 실질적 개선점(누락/중복/dead link)이 확인되어 최소 범위 수정에 적합

Evidence label: direct repository inspection + validator + curl/npm metadata.