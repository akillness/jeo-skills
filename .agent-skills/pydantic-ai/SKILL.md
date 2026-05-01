---
name: pydantic-ai
description: >
  Build typed LLM applications with PydanticAI: schema-constrained outputs,
  tool integration, validation, retries, and deterministic downstream
  handoffs. Use when users need reliable structured outputs instead of
  free-form text generation.
allowed-tools: Bash Read Write Edit Grep Glob
metadata:
  tags: pydantic, structured-output, validation, llm-app, python
  version: "1.0"
  source: pydantic/pydantic-ai
---

# PydanticAI

## When to use this skill
- LLM 출력이 JSON/객체 스키마를 반드시 따라야 할 때
- 후속 자동화(저장/분석/API 호출)에 안정적으로 넘겨야 할 때
- 자유서술보다 검증 가능한 구조화 출력이 중요한 경우

## Instructions

### Step 1) 스키마 우선 설계
- 먼저 Pydantic 모델을 정의하고 필수/선택 필드 분리
- enum/range/regex 제약을 명시
- 오류 메시지는 사용자 교정 가능 형태로 설계

### Step 2) Agent + Tool 결합
- 도구 입출력도 Pydantic 타입으로 통일
- 실패 시 재시도 규칙(필드 누락/타입 불일치)을 분리
- 모델 출력이 스키마 미준수면 즉시 재질문(repair prompt)

### Step 3) 검증/복구 루프
- ValidationError를 카테고리화(누락/형식/논리)
- 동일 오류 반복 시 프롬프트가 아니라 스키마 복잡도 재검토
- 최종 결과에 신뢰 플래그(validated, repaired, failed) 포함

### Step 4) 운영 적용
- DB 저장 전 2차 검증(서버 측) 수행
- 버전드 스키마(`v1`,`v2`)로 호환성 관리
- 관찰 지표: first-pass success, retry rate, field error rate

## Examples
- 요청: "리서치 결과를 항상 동일 포맷 JSON으로 받아서 파이프라인에 넣고 싶다"
- 적용: `ResearchSummary` 스키마 정의 후 Agent 결과를 강제 검증
- 결과: 파싱 실패율 감소, 후속 자동화 안정화

## Best practices
1. 자연어 요구사항을 먼저 스키마로 번역한다.
2. 스키마는 작게 시작하고 점진적으로 확장한다.
3. 재시도 횟수보다 오류 분류 품질을 먼저 개선한다.

## References
- https://github.com/pydantic/pydantic-ai
