## Solution List
- lane-intent/negation/signal-floor 결과를 artifacts markdown에 명시해 reviewer 판독 비용을 낮춘다.
- checks 미보고 시 merge 보류와 재시도 절차를 PR 코멘트에 표준화한다.

## Categories
- survey-quality
- pr-gate-hygiene

## What People Actually Use
- GitHub Code Search API/gh search repos를 통한 주기적 후보 스캔 (provenance: indexed snippet)
- stars/pushed/license 메타 기반 빠른 품질 스크리닝 (provenance: direct page retrieval + indexed snippet)

## Frequency Ranking
- 매 시간: lane 5종 검색 및 evidence 갱신
- 매 PR: checks 확인 후 merge 여부 결정

## Key Gaps
- CI checks 미보고 시 자동 merge 불가
- lane별 low-fit 분류 근거가 누락되면 재현성 저하

## Contradictions
- 후보 수를 늘리면 저품질 포함 위험이 증가함
- 신호 바닥선을 엄격히 적용하면 신규 저성장 프로젝트 탐지가 줄어듦

## Key Insight
- 탐색 리콜은 evidence에 유지하고, 추천은 intent+signal+freshness를 통과한 집합으로 제한할 때 운영 리스크가 가장 낮다.

### Lane Metrics
- agentic_ai_skill: raw=30, kept=30, median_stars=1921.0, status=pass, causes=none
- web_frontend_skill: raw=30, kept=9, median_stars=0.0, status=pass, causes=license,low-signal
- web_backend_skill: raw=30, kept=3, median_stars=0.0, status=pass, causes=license,low-signal
- cli_open_source_skill: raw=22, kept=8, median_stars=0.0, status=pass, causes=license,low-signal
- game_development_skill: raw=30, kept=3, median_stars=0.0, status=pass, causes=license,low-signal
