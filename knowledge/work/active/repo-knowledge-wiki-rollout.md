---
type: work
status: active
date: 2026-11-15
paired_files:
  - scripts/setup-workspace.py
  - .agents/rules/jeo-workflows.md
paired_symbols:
  - scripts/setup-workspace.py#step_mex
  - scripts/setup-workspace.py#step_zvec
  - scripts/setup-workspace.py#step_rules
---

# Repo Knowledge Wiki Rollout

## Goal

단일 Git 저장소에서 코드와 분리된 `knowledge/`(쿼리 히스토리·작업 체크·개념 노트)를 `mex` 심볼 그라운딩과 `zg` 스코프 인덱싱으로 페어링하고, 최소 컨텍스트 게이트를 `setup-workspace.py`와 신규 스킬 `repo-knowledge-wiki`로 표준화한다.

## Checklist
- [x] `rea` 정적 분석으로 `mex-agent@0.8.5` / `@zvec/zvec-grep@0.2.2` 경계 확인
- [x] `knowledge/` 프로토타입 및 `.mex/context/knowledge-pairings.md` 심볼 페어링 검증
- [x] `zg index` 및 스코프 분리(`knowledge/**` vs `!knowledge/**`, `!knowledge/raw/**`) 실측 검증
- [x] `scripts/setup-workspace.py` 및 `jeo-workflows.md` 규칙 업데이트 + 테스트 통과
- [x] `.agent-skills/repo-knowledge-wiki/` 신규 스킬 작성 및 `skills.json` 카탈로그 검증

## Handoff Notes

- 이전 세션/작업: `jev/jev-setup.sh`에 Windows `qev`/`llama-server.exe` 자동 다운로드 지원 추가 (`36ab4281`).
- 핵심 불변량: `.mex/` 밖 문서는 `mex wiki`가 직접 스캔하지 않으므로 반드시 `.mex/context/knowledge-pairings.md` 브리지 엔티티를 통해 `grounds_to`를 유지한다.
