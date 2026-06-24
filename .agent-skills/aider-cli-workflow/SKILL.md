---
name: aider-cli-workflow
description: ">"
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  tags: aider, cli, ai-pair-programming, git, test-driven, code-review
  platforms: Claude, Codex, Gemini, OpenCode
  source: akillness/jeo-skills
  version: 1.0.0
---






# Aider CLI Workflow

Use this skill when the user explicitly wants an **Aider-based coding loop** in a local repo.

## When to use this skill
- Aider 설치/초기 설정 확인부터 실행까지 한번에 정리해야 할 때
- 작은 기능/버그를 테스트 기준으로 AI pair-programming으로 처리할 때
- Aider가 만든 변경을 커밋 단위로 검증/정리해야 할 때

## When not to use
- Hosted PR 리뷰/라벨/브랜치 보호 정책 중심 작업 (`code-review`, GitHub workflow 계열)
- 단순 Git 충돌/복구만 필요한 경우 (`git-workflow`)
- 루트 원인 디버깅 중심 작업 (`debugging`)

## Instructions

### Step 1) Preconditions
1. 저장소 루트 확인: `git rev-parse --show-toplevel`
2. Aider 설치 확인: `aider --version`
3. 기본 검증 명령 확인: 테스트/린트 명령 1개 이상 확보

### Step 2) Scope-lock kickoff
- 한 번에 한 작업(버그 1개/기능 1개)만 지정한다.
- Aider 프롬프트에 반드시 포함:
  - 변경 대상 파일 범위
  - 수용 기준(acceptance criteria)
  - 테스트/검증 명령

### Step 3) Test-backed edit loop
1. 기준 테스트 실행(실패/성공 기준선 확보)
2. Aider로 수정
3. 테스트 재실행
4. diff 확인 후 필요 시 추가 수정

### Step 4) Commit hygiene
- `git add -p`로 변경 범위를 검토
- 커밋 메시지는 의도 + 검증 명령을 포함
- 리스크(실험적 패치, flaky test, 미검증 경로)는 커밋/보고서에 명시

### Step 5) Fallback
- 변경이 과도하게 퍼지면 즉시 범위를 축소하고 재시도
- 테스트가 반복적으로 깨지면 Aider 자동 수정 루프를 멈추고 원인 분석으로 전환

## Output format
```markdown
# Aider Run Brief
- Goal:
- Scope:
- Validation commands:
- Changed files:
- Risks / follow-ups:
```

## Examples

### Example 1: small bugfix loop
- Goal: failing unit test 1개를 green으로 복구
- Scope: 테스트 파일 + 관련 구현 파일만 편집
- Validation: `pytest -q tests/path/test_x.py`

### Example 2: narrow feature increment
- Goal: API 필드 1개 추가 + 역호환 유지
- Scope: schema + handler + 테스트
- Validation: 기존 테스트 + 신규 테스트

## Best practices
1. 항상 baseline 테스트 결과를 먼저 확보한다.
2. 파일 범위를 명시하지 않은 Aider 세션은 시작하지 않는다.
3. 커밋 전에 `git add -p`로 불필요 변경을 제거한다.
4. flaky/실험적 변경은 리스크를 명시하고 후속 TODO를 남긴다.

## References
- Aider: https://github.com/Aider-AI/aider
- Aider docs: https://aider.chat/
