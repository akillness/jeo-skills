# Triage

- Problem: 고정 5개 키워드 레인 survey 결과 추천 후보가 단일 레인(agentic-ai-skill)에 집중되어 커버리지 건강도를 과대평가할 위험이 있다.
- Audience: oh-my-skills 유지보수자 및 시간별 PR 리뷰어
- Why now: unattended cron 루프에서 lane imbalance를 자동 감지하지 못하면 품질 게이트가 느슨해진다.

## Lane Status
- recommended_lane_count: 1 [provenance: indexed snippet]
- single_lane_concentration: true [provenance: indexed snippet]
- agentic-ai-skill: pass (kept_count=3, raw_count=12, median_stars_raw=0.0, zero_star_raw=8) [provenance: indexed snippet]
- web-frontend-skill: degraded (degraded_causes=license|low-signal|stale, kept_count=0, raw_count=4) [provenance: indexed snippet]
- web-backend-skill: degraded (degraded_causes=license, kept_count=0, raw_count=1) [provenance: indexed snippet]
- cli-open-source-skill: degraded (degraded_causes=low-fit, kept_count=0, raw_count=0) [provenance: feed recovery]
- game-development-skill: degraded (degraded_causes=archived|license|low-signal|stale, kept_count=0, raw_count=12) [provenance: indexed snippet]
