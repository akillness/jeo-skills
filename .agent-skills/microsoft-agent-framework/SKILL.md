---
name: microsoft-agent-framework
description: >
  Design enterprise-grade agent systems with Microsoft's agent framework
  patterns: role separation, workflow control, policy boundaries, and
  observability. Use when users need robust organizational agent workflows,
  governance, and maintainable multi-agent architecture.
allowed-tools: Bash Read Write Edit Grep Glob
metadata:
  tags: agentic-ai, microsoft, enterprise, governance, orchestration
  version: "1.0"
  source: microsoft/agent-framework
---

# Microsoft Agent Framework

## When to use this skill
- 조직/팀 단위로 유지되는 에이전트 시스템 설계가 필요할 때
- 책임분리, 거버넌스, 감사 가능한 실행로그가 필요할 때
- 단발성 데모가 아니라 운영/확장 가능한 구조가 필요할 때

## Instructions

### Step 1) 역할 분리 모델 확정
- Planner / Executor / Reviewer / Approver 역할을 분리
- 역할 간 입력/출력 계약(스키마) 먼저 정의
- 승인 단계(Approver)가 필요한 작업군을 선별

### Step 2) 제어흐름 정의
- 동기/비동기 경로 구분
- 실패 시 보상 트랜잭션 또는 롤백 전략 설정
- SLA(응답시간/재시도/중단조건) 명문화

### Step 3) 정책 경계 설정
- 데이터 접근 범위(읽기/쓰기/외부전송) 역할별 제한
- 민감정보 마스킹/로그 보존 정책 적용
- 자동 실행 범위와 인간 승인 범위를 분리

### Step 4) 운영 관측성 구축
- 단계별 trace id 부여
- 실패 원인 분류(정책,도구,모델,입력)
- 주기적 회귀 점검용 시나리오 유지

## Examples
- 요청: "부서 간 승인 흐름을 포함한 에이전트 운영체계를 만들고 싶다"
- 적용: Planner→Executor→Reviewer→Approver 파이프라인 구성
- 결과: 감사 가능한 승인 이력과 실패 복구 경로 확보

## Best practices
1. 역할 분리는 프롬프트 문체가 아니라 권한 경계 중심으로 한다.
2. 승인 없는 자동화는 저위험 작업으로 제한한다.
3. 관측성 없는 최적화는 금지하고, 로그 체계를 먼저 만든다.

## References
- https://github.com/microsoft/agent-framework
