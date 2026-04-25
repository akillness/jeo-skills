# Platform Map

## Settings
- discovery_tool: `gh search repos`
- validator: `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py --platform-topic --require-provenance`
- quality_gate: freshness(24m), signal_floor(stars>=3), concentration_guard(recommended_lane_count>=2 권장)

## Rules
- 5개 keyword family를 매 실행 모두 수행
- keep 후보는 license/pushed_at/archived/fit_rationale 메타데이터를 필수 기록
- provenance 라벨은 validator 허용 집합만 사용 (`indexed snippet`, `feed recovery`, ...)
- recommendation-grade keep가 단일 레인에 집중되면 `single_lane_concentration: true`로 보고

## Hooks
- RTK: lane_metrics helper 출력 요약을 `rtk-summary.md`로 저장
- Graphify: `save-result` 후 query 실패 시 `graphify-refined.json` fallback 생성
- Obsidian: `obsidian-cli create` 실패 시 vault 파일 direct-write fallback

## Platform Gaps
- graphify query는 그래프 파일 부재/스키마 불일치 시 실패 가능
- headless 환경에서 Obsidian URI 실행 실패 가능
- web/frontend/backend/cli/game 레인별 데이터 밀도 불균형으로 recommendation 편향이 발생할 수 있음
