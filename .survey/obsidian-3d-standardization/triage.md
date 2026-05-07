# Triage
- Problem: 최근 3일 내 신규 스킬들 중 `obsidian` 패키지에서 표준 섹션 누락(`## Examples`) 및 중복 헤더(`## Instructions`)로 가독성/검증 일관성이 떨어지고, 외부 레퍼런스 1건이 dead link(404) 상태였다.
- Audience: oh-my-skills 유지보수자, 스킬 사용자(Obsidian 자동화/플러그인 개발).
- Why now: 시간 기반(cron) 품질 루프에서 신규 추가 스킬을 빠르게 안정화해야 이후 재사용 시 오류 전파를 막을 수 있다.

Provenance: direct repository inspection + validator output + curl link check.
Evidence label: direct page retrieval