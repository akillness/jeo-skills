## Summary
- 시간별 5개 lane(agentic/web-frontend/web-backend/cli/game-dev) survey를 수행하고 evidence/artifact를 생성했습니다.
- 추천 승격 기준(token overlap + negation guard + signal floor + freshness + license + non-archived)을 evidence에 반영했습니다.
- 저위험 고효용 변경으로 lane metric integrity gate 레퍼런스 문서를 추가했습니다.

## Evidence / Provenance
- Evidence JSON: `.survey/hourly-skill-candidates-20260506-070542/evidence.json`
- Provenance labels: `indexed snippet`, `direct page retrieval`
- RTK summary: `.survey/hourly-skill-candidates-20260506-070542/rtk-summary.md`
- Graphify output/fallback: lane metrics fallback committed (graphify unavailable in runtime)

## Risk
- 엄격한 필터로 추천 수가 감소할 수 있습니다(precision 우선).
- lane별 결과 편차가 존재할 수 있어 degraded 원인 분류를 병행합니다.

## Rollback Plan
- 본 PR revert 시 `.survey/hourly-skill-candidates-20260506-070542/` 산출물과 신규 reference 문서만 제거하면 됩니다.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260506-070542 --platform-topic --require-provenance` PASS
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` PASS
- `git diff --check` PASS
