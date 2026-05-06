# Triage
- Problem: 시간별 후보 탐색이 lane별로 편향되거나 무근거 추천으로 누적될 수 있음.
- Audience: oh-my-skills 유지보수자/자동화 런 운영자.
- Why now: hourly 루프에서 PR 품질 게이트 통과율과 재현성을 높여야 함.

## Lane Snapshot
- agentic ai skill: raw=30, kept=5, status=pass, provenance=indexed snippet
- web frontend skill: raw=5, kept=0, status=degraded, provenance=indexed snippet
- web backend skill: raw=1, kept=0, status=degraded, provenance=indexed snippet
- cli open source skill: raw=1, kept=1, status=pass, provenance=indexed snippet
- game development skill: raw=30, kept=1, status=pass, provenance=indexed snippet

Provenance: indexed snippet, feed recovery
