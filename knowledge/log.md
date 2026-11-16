# Knowledge Log

## 2026-11-16

- **work | active**: Opened [jeo-db-core-extraction-plan](work/active/jeo-db-core-extraction-plan.md) — AGY 트라젝토리 `71317abb`(cascade `4d3bc836`) 이어받기. 인터뷰 결정: 그래프+의미검색만 발췌, Python stdlib 자체 구현, 레포별 `.jeo/db/`, MCP+CLI 둘 다, jeo-skills 먼저.
- **work | milestone**: jeox 구현 완료 — `scripts/jeox.py` (sqlite3 그래프+FTS5+MCP stdio), `scripts/test_jeox.py` 11/11 통과, `setup-workspace.py` step_jeox 등록, `~/.local/bin/jeox` 심볼릭 링크, `.opencode/opencode.json` MCP 등록, `tools.jeox.*` 5도구 실측 확인. jeo-skills DB 30MB (symbols 4,290 / edges 80,663 / chunks 21,263). jeopi 이식(M4) 대기.

## 2026-11-15

- **init | structure**: Bootstrapped repository-local `knowledge/` (`raw/`, `queries/`, `work/active/`, `work/archive/`, `concepts/`) and allowlisted `!/knowledge/` in `.gitignore`.
- **query | architecture**: Filed [2026-11-15-mex-zvec-unified-knowledge-architecture](queries/2026-11-15-mex-zvec-unified-knowledge-architecture.md) after `rea` static inspection of `mex-agent@0.8.5` and `@zvec/zvec-grep@0.2.2`.
- **work | active**: Opened [repo-knowledge-wiki-rollout](work/active/repo-knowledge-wiki-rollout.md) to track prototype verification, `setup-workspace.py` integration, and `repo-knowledge-wiki` skill packaging.
