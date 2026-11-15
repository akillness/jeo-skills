---
type: concept
status: active
date: 2026-11-15
paired_files:
  - scripts/setup-workspace.py
paired_symbols:
  - scripts/setup-workspace.py#step_mex
  - scripts/setup-workspace.py#step_zvec
---

# Code-Doc Pairing Bridge

## Why a Bridge Is Needed

- `mex-agent`의 `wiki.db`는 `.mex/` 스캐폴드 내부 파일만 `grounds_to`로 추적한다.
- `zvec-grep`(`zg`)은 `.mex/` 같은 숨김 디렉토리를 기본 스킵하고, 일반 디렉토리의 Markdown 헤딩을 벡터/BM25로 인덱싱한다.

## How Pairing Works

1. 본문(쿼리 히스토리, 작업 체크, 개념 노트)은 `knowledge/` 아래에 저장한다.
2. `.mex/context/knowledge-pairings.md`에 각 `knowledge/` 문서에 대응하는 `<!-- mex:entity ... -->` 블록을 두고 `mex.grounds_to`에 코드 심볼(`file` + `symbol`)을 기록한다.
3. 코드 심볼이 변경되면 `mex-agent check`가 `.mex/context/knowledge-pairings.md`의 stale 엔티티를 탐지하고, `mex-agent wiki for-code`가 해당 심볼에 연결된 `knowledge/` 경로를 즉시 반환한다.
