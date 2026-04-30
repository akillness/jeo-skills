---
name: openai-agents-python
description: >
  Build and operate multi-agent workflows with OpenAI Agents SDK (Python):
  define agents/tools/handoffs, add guardrails, run conversations, and debug
  orchestration behavior. Use when users ask for agent orchestration with
  OpenAI-native patterns, handoff routing, or production-ready agent loops.
allowed-tools: Bash Read Write Edit Grep Glob
metadata:
  tags: agentic-ai, multi-agent, orchestration, openai, python, handoff
  version: "1.0"
  source: openai/openai-agents-python
---

# OpenAI Agents Python

## When to use this skill
- OpenAI Agents SDK 기반으로 멀티에이전트 워크플로우를 만들 때
- `tool calling`, `handoff`, `guardrail`이 필요한 에이전트 설계를 할 때
- 프로토타입이 아니라 운영 가능한 에이전트 루프 구조가 필요할 때

## Instructions

### Step 1) 작업 목표를 에이전트 토폴로지로 분해
- Coordinator 1개 + Specialist N개 기본 구조로 시작
- 각 Specialist는 단일 책임(검색/분석/실행/검증) 원칙 유지
- handoff 조건을 자연어가 아니라 명시 규칙으로 기록

### Step 2) 최소 실행 루프 먼저 만들기
- 첫 단계는 “한 입력 → 한 handoff → 한 결과”의 최소 루프
- 도구 호출 실패/타임아웃을 표준 에러 포맷으로 수집
- 로그는 `agent`, `tool`, `handoff`, `latency` 기준으로 남김

### Step 3) Guardrail 추가
- 금지 작업(파괴적 명령, 외부 전송)을 정책으로 명시
- 출력 스키마를 고정(JSON schema)해 후속 파이프라인 안정화
- 재시도 횟수/중단 조건(max turns) 명시

### Step 4) 품질 점검
- 케이스 3종: 정상, 경계, 실패
- handoff 오탐/미탐 비율을 체크
- 에러가 반복되면 프롬프트보다 라우팅 규칙을 먼저 수정

## Examples
- 요청: "리서치/요약/검증을 분리한 에이전트 파이프라인을 만들고 싶다"
- 적용: Coordinator가 intent 분류 후 Researcher/Writer/Verifier로 handoff
- 결과: 단계별 산출물과 검증 로그를 분리 저장

## Best practices
1. 처음부터 5개 이상 에이전트로 시작하지 않는다.
2. handoff 규칙은 문장보다 조건식으로 기록한다.
3. 모델 교체 가능성을 위해 도구 인터페이스를 고정한다.
4. 실패 복구는 재시도보다 fallback route(다른 specialist)로 푼다.

## References
- https://github.com/openai/openai-agents-python
