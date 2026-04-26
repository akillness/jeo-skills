# Context
## Workflow Context
- 5개 필수 키워드 lane을 survey 검색으로 수집하고, 검색 결과(indexed snippet) + 저장소 메타(direct page retrieval)로 추천 등급 후보를 선별했다.
- stage recovery는 objective trigger 기반으로 실행했고, lane metrics를 최종 선택 결과셋 기준으로 재계산했다.

## Affected Users
- 스킬 작성자: 신규 스킬 템플릿/근거 기반 보강 필요.
- 리뷰어: provenance/리스크/롤백 명시 여부 검토 필요.
- 자동화 운영자: lane degraded 원인 및 집중도 모니터링 필요.

## Current Workarounds
- 검색 노이즈 lane은 stage recovery 쿼리 적용.
- 근거 신뢰도가 낮으면 후보 승격 대신 문서/검증 하드닝 우선.

## Adjacent Problems
- 오픈 PR 누적에 따른 브랜치/주제 충돌 가능성.
- 체크 미구성 저장소의 merge 품질게이트 해석 불확실성.

## User Voices
- 운영 규칙: RTK 요약, Graphify 정제, Obsidian/LLM-Wiki 반영, survey 기반 근거 수집 필수.

## Lane Evidence Snapshot
### agentic ai skill
- lane_status: pass
- kept_count/raw_count: 3/25
- median_stars_raw: 0
- zero_star_raw: 17
- degraded_causes: (none)
- AbdelhakRazi/flutter-bloc-clean-architecture-skill (14★) — https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill [indexed snippet]
- iwe-org/skills (7★) — https://github.com/iwe-org/skills [indexed snippet]
- Ap6pack/malwar (0★) — https://github.com/Ap6pack/malwar [indexed snippet]

### web frontend skill
- lane_status: pass
- kept_count/raw_count: 15/17
- median_stars_raw: 8333
- zero_star_raw: 0
- degraded_causes: (none)
- brillout/awesome-react-components (47408★) — https://github.com/brillout/awesome-react-components [indexed snippet]
- mantinedev/mantine (31060★) — https://github.com/mantinedev/mantine [indexed snippet]
- mui/material-ui (98235★) — https://github.com/mui/material-ui [indexed snippet]

### web backend skill
- lane_status: pass
- kept_count/raw_count: 5/9
- median_stars_raw: 11136
- zero_star_raw: 0
- degraded_causes: (none)
- helios-framework/helios (4081★) — https://github.com/helios-framework/helios [indexed snippet]
- shuttle-hq/shuttle (6913★) — https://github.com/shuttle-hq/shuttle [indexed snippet]
- octobercms/october (11136★) — https://github.com/octobercms/october [indexed snippet]

### cli open source skill
- lane_status: pass
- kept_count/raw_count: 17/25
- median_stars_raw: 5422
- zero_star_raw: 0
- degraded_causes: (none)
- cli/cli (44066★) — https://github.com/cli/cli [indexed snippet]
- firebase/firebase-tools (4398★) — https://github.com/firebase/firebase-tools [indexed snippet]
- sharkdp/hyperfine (27997★) — https://github.com/sharkdp/hyperfine [indexed snippet]

### game development skill
- lane_status: pass
- kept_count/raw_count: 1/25
- median_stars_raw: 0
- zero_star_raw: 14
- degraded_causes: (none)
- UnrealBlueprint/02_CrystalCavern (9★) — https://github.com/UnrealBlueprint/02_CrystalCavern [indexed snippet]
- rohithnafeel/My-CS-Projects (20★) — https://github.com/rohithnafeel/My-CS-Projects [indexed snippet]
- Unengine/GameEngineAndGameMathTIL (4★) — https://github.com/Unengine/GameEngineAndGameMathTIL [indexed snippet]
