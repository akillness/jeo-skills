---
type: "query"
date: "2026-04-24T15:42:30.726135+00:00"
question: "hourly 후보 탐색에서 survey 스킬의 반복 품질을 높이기 위해 필수로 추가할 규칙은 무엇인가?"
contributor: "graphify"
source_nodes: ["survey", "graphify", "rtk", "llm-wiki"]
---

# Q: hourly 후보 탐색에서 survey 스킬의 반복 품질을 높이기 위해 필수로 추가할 규칙은 무엇인가?

## Answer

반복 cron 루프에서는 5개 키워드 패밀리 스윕과 relevance gate(license, pushed_at/updated, archived, fit rationale) 기록을 명시해야 한다.

## Source Nodes

- survey
- graphify
- rtk
- llm-wiki