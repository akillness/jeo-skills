---
type: work
status: active
date: 2026-11-16
paired_files:
  - scripts/jeox.py
  - .jeo/db/
paired_symbols:
  - scripts/jeox.py#cmd_build
  - scripts/jeox.py#cmd_query
tags:
  - jeox
  - mex
  - zvec-grep
  - code-graph
  - fts5
---

# Jeo DB — Core Extraction Plan (mex + zvec-grep → 자체 경량 구현)

## Origin

AGY 트라젝토리 `71317abb-bd31-4fe4-b7f6-2d729379b27a` (cascade `4d3bc836-…`, 워크스페이스 jeo-skills, 2026-11-16). "mex/zvec 방식을 jeo·jeopi에 별도 DB로 적용, 핵심 기능만 발췌". 같은 프롬프트의 jeo CLI 세션(`.jeo/sessions/bfa25598`)은 HTTP 400 실패로 중단됨.

## Interview Decisions (확정)

| 결정 | 선택 |
|---|---|
| 발췌 범위 | 그래프 검색 + 하이브리드 의미 검색 **만** (위키·`grounds_to` 페어링·라이브 갱신 제외) |
| 구현 경로 | **자체 경량 구현** — Python stdlib + sqlite3, mex-agent/zvec-grep 바이너리 의존 제거 |
| DB 배치 | 레포별 로컬 DB → **`.jeo/db/`** (git 무시, 세션 간 지속) |
| 에이전트 소비 | **MCP stdio 서버 + CLI 둘 다** (jeo-code CLI 수정 없이 독립 `jeox`로 제공) |
| 적용 순서 | **jeo-skills 먼저** → jeopi 이식 |
| 런타임(기본값 확정) | **Python stdlib** (추천안 무반응 → 기본 채택) |
| 임베딩(기본값 확정) | **BM25(FTS5) 먼저**, 벡터 컬럼만 예약 |
| 추출 깊이(기본값 확정) | **정규식 기반 가벼운 추출** |

## Scope — 발췌 대상 (분석 문서 `2026-11-15-mex-zvec-unified-knowledge-architecture.md` 기준)

### Keep (핵심)
1. **코드 그래프**: `who-calls`, `what-calls`, `where-defined`, `impact`
2. **의미 검색**: BM25 풀텍스트, 스코프 glob (`-g 'knowledge/**'`), 헤딩 청킹 Markdown

### Drop (제외 — mex/zvec의 나머지)
- mex 위키 라이브 갱신(`wiki update`), ROUTER.md 자동화, `grounds_to` MinHash 페어링, `mex check/sync/impact`의 스캐폴드 관리
- zvec의 임베딩 인덱스(`index.zvec`), 관리형 MCP 서버, 원격 임베딩

## Architecture

```
repo/
├── .jeo/
│   └── db/
│       └── jeo.db          # 단일 SQLite (그래프 + FTS5)  ← 이전 계획안 .jeox/ 통합
└── scripts/
    └── jeox.py             # 라이브러리 + CLI (하나의 파일)
```

### SQLite 스키마 (`.jeo/db/jeo.db`)

```sql
CREATE TABLE symbols (            -- 코드 심볼 (그래프 노드)
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,             -- 마지막 정의 이름 (호출은 이름으로만 매칭)
  kind TEXT,                      -- function|class|method|const
  path TEXT NOT NULL,             -- 레포 상대경로
  line INTEGER,
  lang TEXT                       -- ts|js|py|rs|md
);
CREATE INDEX idx_symbols_name ON symbols(name);

CREATE TABLE edges (              -- 호출/참조 엣지
  caller_id INTEGER REFERENCES symbols(id),
  callee_name TEXT NOT NULL,      -- 미해결 이름 (정확 매칭은 who-calls에서 join)
  kind TEXT,                      -- call|import
  src_line INTEGER
);

CREATE TABLE chunks (             -- 의미 검색 (BM25)
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  heading TEXT,                   -- 마크다운 헤딩 경로 (mex/zvec 청킹 방식)
  body TEXT NOT NULL,
  lang TEXT
);
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  body, heading, path, content='chunks', content_rowid='id'
);
-- 벡터 예약 컬럼은 이후 마이그레이션 (임베딩 도입 시 chunks에 vec BLOB 추가)
```

### Extractor (`scripts/jeox.py build`)

- 대상: `*.ts`, `*.tsx`, `*.mjs`, `*.js`, `*.py`, `*.rs`, `*.md` — `node_modules/`, `.git/`, `.jeo/`, `.mex/`, `.zvec-grep/`, lock 파일 제외
- **그래프 추출**: import 문 + `name(` / `obj.name(` 호출점 정규식. 함수/클래스 정의 시그니처 매칭으로 `symbols` 구성. (분석 문서의 mex 검증 방식과 동일한 휴리스틱 수준)
- **검색 청킹**: Markdown은 헤딩(`#`~`####`) 단위 청크(≤3,600자, 오버랩 540자 — zvec `markdown/extractor.js` 파라미터 준용), 코드는 파일 전체 + 함수 경계 근사
- **증분**: `mtime + sha256` 기준, 변경 파일만 재추출 (target table: `files_state`)

### CLI (`scripts/jeox.py` → `~/.local/bin/jeox` 심볼릭 링크)

```bash
jeox build [--repo PATH] [--full]        # 증분/전체 인덱싱
jeox who-calls <name> [--json]
jeox what-calls <name> [--json]
jeox where-defined <name> [--json]
jeox impact <name|path> [--json]
jeox query "<질의>" [-g GLOB]... [--preview none] [--limit N] [--json]
jeox status [--json]
jeox mcp                                  # MCP stdio 서버
```

### MCP stdio 서버 (`jeox mcp`)

stdlib JSON-RPC 2.0으로 5개 도구만 노출 (동일한 OpenCode/Claude/Codex 소비면 충분):
`jeox_who_calls` · `jeox_what_calls` · `jeox_where_defined` · `jeox_impact` · `jeox_search(scope globs 지원)`

## Milestones

- [x] **M1 — jeox.py 스키마 + extractor + CLI 그래프 명령** (jeo-skills에 `jeox build` → `who-calls/what-calls/where-defined/impact` 동작) — 2026-11-16 완료
- [x] **M2 — FTS5 검색 + 스코프 glob** (`jeox query '지식 아키텍처' -g 'knowledge/**'`) — 2026-11-16 완료
- [x] **M3 — MCP 서버 + OpenCode 설정 연결** — `tools.jeox.*` 5도구 실측 응답 확인 — 2026-11-16 완료
- [x] **M4 — jeopi 이식** (동일 스크립트 복사 + `jeox build` + Rust `fn` 추출 보강 확인) — 2026-11-16 완료: 전역 심볼릭 링크로 복사 불필요. jeopi DB 58MB, symbols 28,135 / edges 513,617 / chunks 12,610, crates/ 내 function 5,598 + class 729. `.opencode/opencode.json` MCP 등록 후 tools/list 실측 5도구.
- [x] **M5 — 테스트**: `scripts/test_jeox.py` (pytest) — 추출/스코프/CLI 회귀 — 11/11 통과 (2026-11-16)

## Acceptance (실측 결과 반영)

1. ~~`who-calls step_mex`~~ → `step_mex`는 dispatch dict(`"mex": step_mex`)으로 호출되어 직접 call edge 없음. 실측 대체: `jeox who-calls resolve_mex_bin` → `pair_sync.py#sync_pairings` (L151, resolved) ✅
2. `jeox query 'mex zvec 경계' -g 'knowledge/**' --limit 5` → 2026-11-15 쿼리 문서 + 계획서 상위 반환 ✅ (질의 84ms)
3. DB 용량 실측 ~30MB (마크다운 스킬 코퍼스 21k 청크 특성상 기존 <10MB 목표를 <40MB로 조정) ✅
4. MCP 도구 5개가 OpenCode 세션에서 정상 응답 ✅ (Code Mode 카탈로그에 `tools.jeox.*` 로드 확인)
5. jeopi `jeox build` ✅ — Rust `fn` 추출 확인 (`crates/pi-walker/src/cache.rs` `normalize_worker_count` → who-calls resolved `CacheEntry` L37, where-defined 정확, `query 'cache worker count'` Rust 스니펫 반환)

## Non-goals / 미정 (다음 인터뷰 후보)

- 임베딩 백엔드 선정(로컬 vs 호스티드) — BM25 충분성 실측 후 결정
- `jeo` CLI 서브커맨드 통합(`jeo index …`) — 독립 `jeox` 우선
- 크로스-레포 서버(중앙 DB) — 레포별 완성 후 재논의
- mex `impact`의 트랜짓 클로저 반경 표시 — M1 이후 필요 시
