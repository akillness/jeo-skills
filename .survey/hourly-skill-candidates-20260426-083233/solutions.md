# Solutions
## Solution List
### 신규 스킬 제안 TOP 3
- 제안: `cli/cli` 기반 신규 스킬 (cli open source skill)
  - 근거: https://github.com/cli/cli [direct page retrieval]
  - 라이선스: MIT | pushed_at: 2026-04-24T13:54:31Z | archived: False
  - 예상 경로: `.agent-skills/cli/SKILL.md`
- 제안: `firebase/firebase-tools` 기반 신규 스킬 (cli open source skill)
  - 근거: https://github.com/firebase/firebase-tools [direct page retrieval]
  - 라이선스: MIT | pushed_at: 2026-04-25T02:10:42Z | archived: False
  - 예상 경로: `.agent-skills/firebase-tools/SKILL.md`
- 제안: `AbdelhakRazi/flutter-bloc-clean-architecture-skill` 기반 신규 스킬 (agentic ai skill)
  - 근거: https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill [direct page retrieval]
  - 라이선스: Apache-2.0 | pushed_at: 2026-01-29T09:33:47Z | archived: False
  - 예상 경로: `.agent-skills/flutter-bloc-clean-architecture-skill/SKILL.md`
### 기존 스킬 개선 제안 TOP 3
- `survey` 스킬에 metric integrity gate 추가 (recovery 후 `kept_count <= raw_count` 강제)
  - 근거: 이번 run에서 recovery 전/후 집계 불일치 리스크 확인
  - 예상 수정 파일: `.agent-skills/survey/SKILL.md`, `.agent-skills/survey/SKILL.toon`, `.agent-skills/survey/evals/evals.json`
- provenance/검증 계약 유지 강화
  - 근거: validator `--require-provenance` 통과 필요
  - 예상 수정 파일: `.survey/<slug>/*` 산출물
- hourly 문서화 보강
  - 근거: reviewer가 lane-health trend를 빠르게 파악해야 함
  - 예상 수정 파일: `context.md`, `rtk-summary.md`, `graphify-refined.json`
## Categories
- 신규안: CLI/Agentic 중심 실무형 스킬 추가
- 개선안: survey 품질 게이트 및 평가셋 강화
## Frequency Ranking
- agentic ai skill: kept 3 / raw 25 (status=pass)
- web frontend skill: kept 15 / raw 17 (status=pass)
- web backend skill: kept 5 / raw 9 (status=pass)
- cli open source skill: kept 17 / raw 25 (status=pass)
- game development skill: kept 1 / raw 25 (status=pass)
## What People Actually Use
- CLI lane에서는 `cli/cli`, `sharkdp/hyperfine`, `arduino/arduino-cli` 같은 고신호 저장소가 반복적으로 관측됨. [direct page retrieval]
- Frontend lane은 대형 React 컴포넌트 생태계(mui/mantine 등) 중심으로 고정되어 신규성은 낮고 개선안 중심 접근이 적합. [indexed snippet]

## Key Gaps
- game/agentic lane은 노이즈 비율이 높아 추천 품질이 흔들릴 수 있음.
- recovery 쿼리 전환 시 집계 일관성 검사가 없으면 리뷰 신뢰도가 떨어짐.

## Contradictions
- 검색 상위 노출(repo popularity)과 실제 스킬화 가치(재사용 가능 워크플로우 문서화)는 일치하지 않는 경우가 많음.

## Key Insight
- 추천 후보 확장보다, survey 메트릭 무결성(`kept_count <= raw_count`)과 provenance 계약 준수가 반복 자동화의 품질을 더 크게 좌우한다.

## Curated Sources
- [agentic ai skill] AbdelhakRazi/flutter-bloc-clean-architecture-skill — https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill [indexed snippet]
- [agentic ai skill] iwe-org/skills — https://github.com/iwe-org/skills [indexed snippet]
- [web frontend skill] brillout/awesome-react-components — https://github.com/brillout/awesome-react-components [indexed snippet]
- [web frontend skill] mantinedev/mantine — https://github.com/mantinedev/mantine [indexed snippet]
- [web backend skill] helios-framework/helios — https://github.com/helios-framework/helios [indexed snippet]
- [web backend skill] shuttle-hq/shuttle — https://github.com/shuttle-hq/shuttle [indexed snippet]
- [cli open source skill] cli/cli — https://github.com/cli/cli [indexed snippet]
- [cli open source skill] firebase/firebase-tools — https://github.com/firebase/firebase-tools [indexed snippet]
- [game development skill] UnrealBlueprint/02_CrystalCavern — https://github.com/UnrealBlueprint/02_CrystalCavern [indexed snippet]
- [game development skill] rohithnafeel/My-CS-Projects — https://github.com/rohithnafeel/My-CS-Projects [indexed snippet]
