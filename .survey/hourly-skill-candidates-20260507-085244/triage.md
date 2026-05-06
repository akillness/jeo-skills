# Triage
- Problem: 시간별 후보 발굴 루프에서 lane별 품질 편차와 체크 부재로 인해 자동 merge 신뢰도가 낮아질 수 있음.
- Audience: oh-my-skills 유지보수자 및 자동화 운영자.
- Why now: open PR 누적 및 checks 미보고 패턴이 반복되어, 근거 기반 lane 상태 보고와 게이트 강화를 즉시 유지해야 함.

## Lane Health Snapshot
- agentic-ai-skill: lane_status=pass, kept_count=30, raw_count=30, median_stars_raw=2014.0, zero_star_raw=0, degraded_causes=- (provenance: indexed snippet/feed recovery)
- web-frontend-skill: lane_status=pass, kept_count=2, raw_count=30, median_stars_raw=0.0, zero_star_raw=18, degraded_causes=license,low-fit,low-signal (provenance: indexed snippet/feed recovery)
- web-backend-skill: lane_status=pass, kept_count=1, raw_count=30, median_stars_raw=0.0, zero_star_raw=22, degraded_causes=license,low-fit,low-signal (provenance: indexed snippet/feed recovery)
- cli-open-source-skill: lane_status=pass, kept_count=7, raw_count=23, median_stars_raw=0, zero_star_raw=12, degraded_causes=license,low-fit,low-signal (provenance: indexed snippet/feed recovery)
- game-development-skill: lane_status=pass, kept_count=1, raw_count=30, median_stars_raw=0.0, zero_star_raw=23, degraded_causes=license,low-fit,low-signal (provenance: indexed snippet/feed recovery)
