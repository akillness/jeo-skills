## Solution List
1. `obsidian` 신규 스킬 문서 최소 수정(섹션/헤더/링크/보안 주의문)
2. 3일 신규 스킬 전체를 validator로 재확인해 스코프 내 추가 경고 탐지
3. 로컬 자산 링크(`references/`, `scripts/`, `templates/`, `assets/`) 존재성 확인

## Categories
- documentation-standardization
- security-hardening
- link-integrity

## What People Actually Use
- `.agent-skills/skill-standardization/scripts/validate_skill.sh`로 SKILL.md 규격 점검
- `curl -I -L`로 외부 문서 링크 상태 점검
- `npm view <pkg> repository.url`로 authoritative repo 확인

## Frequency Ranking
1. 섹션 누락/헤더 중복 (자주)
2. 외부 링크 변동/이전 (중간)
3. 보안 주의 부재 (중간)

## Key Gaps
- `obsidian/SKILL.md`에 `## Examples` 부재
- 문서 하단 `## Instructions` 중복 헤더
- `eslint-plugin-obsidianmd` GitHub 링크가 404
- 원격 생성기 실행 예시에 대한 보안 주의문 부재

## Contradictions
- validator는 `Instructions` 존재를 만족하지만, 문서 내 중복 `Instructions`가 독자 혼란을 유발함

## Key Insight
- 대규모 리팩토링 없이도 단일 SKILL.md의 소규모 수정으로 보안/품질/완성도 게이트를 동시에 개선 가능.

## Candidate Metadata Gate
- candidate: `.agent-skills/obsidian`
- license: MIT (repo-level)
- updated/pushed_at: 확인 출처 `git log` (이번 실행 시점 3일 윈도우 내 신규 추가로 식별)
- archived: false (source repo 링크 응답 200)
- fit rationale: 최근 신규 추가 스킬 중 실제 validator 경고 + 링크 무결성 이슈가 확인되어 bounded fix 대상으로 적합
- provenance: direct command retrieval (`git`, validator script, `curl -I -L`, `npm view`)
