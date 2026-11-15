---
type: query
status: active
date: 2026-11-15
paired_files:
  - scripts/setup-workspace.py
paired_symbols:
  - scripts/setup-workspace.py#step_mex
  - scripts/setup-workspace.py#step_zvec
  - scripts/setup-workspace.py#step_rules
tags:
  - mex
  - zvec-grep
  - llm-wiki
  - architecture
---

# Mex & Zvec Unified Knowledge Architecture

## Question

하나의 Git 저장소 안에서 코드와 LLM Wiki(쿼리 히스토리·작업 체크 메모리·합성 지식)를 분리 관리하면서도, 코드↔문서를 정밀 페어링하고 불필요한 컨텍스트 로딩을 차단하려면 어떤 구조가 최적인가?

## Evidence (`rea` + Runtime Inspection)

- `mex-agent@0.8.5` (`chunk-6MUWT2QK.js`): `mex wiki`는 `scaffoldRoot`(= `.mex/`) 내부 마크다운만 인덱싱하며 상위 경로(`../`)를 `WikiRefreshPathError`로 거부한다. 코드 심볼↔위키 바인딩(`mex.grounds_to`, `mh2:64` MinHash 지문)과 `mex wiki for-code` / `mex check` / `mex impact`는 `.mex/` 안에서만 동작한다.
- `@zvec/zvec-grep@0.2.2` (`scanner/index.js`, `markdown/extractor.js`): `zg`는 숨김 디렉토리(`.mex/`)를 기본 스킵하지만, 일반 디렉토리의 Markdown은 헤딩(`#`, `##`) 단위로 청킹(최대 3,600자, 540자 오버랩)하고 Outline 프래그먼트를 생성한다.

## Decision

**Pattern X (이중 레이어 브리지)** 를 채택한다.

1. **사람·Git·`zg` 1급 저장소 (`knowledge/`)**: `raw/`(불변), `queries/`, `work/active/`, `work/archive/`, `concepts/`, `index.md`, `log.md`.
2. **코드 심볼 페어링 브리지 (`.mex/context/knowledge-pairings.md`)**: `<!-- mex:entity ... -->` 블록이 `mex.grounds_to`로 코드 심볼에 바인딩되고, 본문에서 `../../knowledge/...` 문서를 참조한다.
3. **컨텍스트 게이트**:
   - 코드 변경 시 `mex-agent wiki for-code` / `impact`로 연결된 문서만 조회
   - 의미/과거 쿼리 탐색 시 `zg query ... -g 'knowledge/**' -g '!knowledge/raw/**' -g '!knowledge/work/archive/**' --preview none --limit 5`
   - 코드 탐색 시 `zg query ... -g '!knowledge/**' --preview none`
