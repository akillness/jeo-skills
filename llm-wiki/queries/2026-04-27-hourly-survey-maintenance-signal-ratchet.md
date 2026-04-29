# Hourly Survey Maintenance-Signal Ratchet

## Question
Hourly 후보 탐색에서 추천/배제 근거의 유지보수 설명력을 낮은 리스크로 어떻게 높일 수 있는가?

## Answer (ratchet)
`repo-maintenance` survey relevance gate의 metadata minimum을 `license`, `pushed_at`, `archived`에서 확장해 `open_issues`, `forks`를 명시적으로 포함한다. 또한 keep/reject rationale에 해당 필드를 기록하도록 강제한다.

## Why this now
이번 run(`hourly-skill-candidates-20260427-185913`)은 lane health를 안정적으로 산출했지만, reviewer-facing 요약에서 유지보수 신호(open issues/forks) 근거가 규격으로 고정돼 있지 않아 run-to-run 비교 설명력이 떨어졌다.

## Evidence
- Survey artifacts: `.survey/hourly-skill-candidates-20260427-185913/`
  - `evidence.json`
  - `rtk-summary.md`
  - `graphify-refined.json` (fallback-generated)
  - `validation.txt`
- GitHub REST metadata fields:
  - https://docs.github.com/en/rest/repos/repos#get-a-repository
  - https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories

## Proposed low-risk change
1. `.agent-skills/survey/SKILL.md` Step 4.5 metadata minimum 항목에 `open_issues`, `forks` 추가
2. keep/reject rationale 작성 규칙에 maintenance signals 명시
3. 기존 quality gates(license/freshness/archived/signal floor)는 유지

## Risk / Rollback
- Risk: 평가 필드가 늘어나 markdown artifact가 약간 길어질 수 있음
- Rollback: 해당 두 필드를 optional로 되돌리면 즉시 원복 가능 (동작 경로 파괴 없음)
