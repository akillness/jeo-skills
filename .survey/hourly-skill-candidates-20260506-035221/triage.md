# Triage
- Problem: 시간별 survey에서 lane별 발견 품질 편차로 인해 low-fit/low-signal 후보가 누적될 위험이 있음. (provenance: indexed snippet)
- Audience: oh-my-skills 유지보수자 및 자동화 PR 리뷰어.
- Why now: 최근 24시간~7일 창에서 lane별 결과 밀도가 다르고, 필터 규칙(의도 토큰/신호/신선도) 준수가 merge 품질의 핵심 게이트이기 때문.
