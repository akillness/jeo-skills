# Knowledge Index

> Repository-local LLM Wiki, query history, and work-progress memory.
> Code stays in source directories; durable knowledge lives here and pairs to code symbols via `.mex/context/knowledge-pairings.md`.

## Retrieval Gate (Read Before Searching)

1. **Code change / impact check** → `mex-agent wiki for-code <file|symbol>` or `mex-agent impact <symbol|file>` first; load only the linked `knowledge/` file sections.
2. **Semantic / past-query search** → `zg query "<query>" -g 'knowledge/**' -g '!knowledge/raw/**' -g '!knowledge/work/archive/**' --preview none --limit 5`, then read only matched line ranges.
3. **Code search** → `semble search "<query>" <path>` or `zg query "<query>" -g '!knowledge/**' --preview none --limit 8`.

## Active Work (`work/active/`)

- [Repo Knowledge Wiki Rollout](work/active/repo-knowledge-wiki-rollout.md) — `active` · `mex` + `zvec-grep` + `llm-wiki` 통합 구축 및 스킬화 체크 메모리

## Queries & Decisions (`queries/`)

- [2026-11-15: Mex & Zvec Unified Knowledge Architecture](queries/2026-11-15-mex-zvec-unified-knowledge-architecture.md) — `rea` 정적 분석 기반 Pattern X(이중 레이어 브리지) 설계 결정

## Concepts (`concepts/`)

- [Code-Doc Pairing Bridge](concepts/code-doc-pairing-bridge.md) — `.mex/` 심볼 그라운딩과 `knowledge/` 시맨틱 인덱싱의 이중 레이어 페어링 모델

## Archive & Raw

- `work/archive/` — 완료·대체된 작업 체크 메모리 (기본 검색 제외)
- `raw/` — 불변 원본 캡처 (기본 `zg` 검색에서 `-g '!knowledge/raw/**'`로 제외)
