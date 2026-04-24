# Triage
- Problem: 시간당 후보 탐색에서 web_search API 장애(401)와 GitHub 검색 노이즈로 인해 신규/개선 후보 품질이 흔들릴 수 있음.
- Audience: oh-my-skills 유지보수자(스킬 큐레이터), 자동화 크론 실행자.
- Why now: PR 기반 자동 유지보수 루프에서 잘못된 후보를 선택하면 반복적으로 저품질 변경이 누적되므로 즉시 완화가 필요함.
