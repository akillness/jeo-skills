# Triage

- Problem: hourly 스킬 유지보수 루프에서 survey 품질 게이트는 있지만, 추천 후보의 **유지보수 신호(issues/forks) 근거**가 명시적으로 남지 않아 반복 실행 시 판단 일관성이 흔들릴 수 있다.
- Audience: oh-my-skills 유지보수 자동화 에이전트 및 리뷰어
- Why now: 최근 hourly 루프가 저신호/노이즈 후보를 반복적으로 배제하는 과정에서, 왜 배제/채택했는지의 설명력이 stars·license·freshness 중심으로 제한되어 있어 PR 리뷰 근거를 더 구조화할 필요가 있다.
