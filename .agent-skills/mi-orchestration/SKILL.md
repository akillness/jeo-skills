---
name: mi-orchestration
description: >
  Design, audit, and safely resume mobile-game market-intelligence pipelines across
  licensed collection, immutable raw snapshots, normalized core, analytical marts,
  health gates, candidate signals, report rendering, and human decision records.
  Use when the user names MI orchestration, asks about Sensor Tower or Playliner
  data flow, weekly/backfill runs, stale artifacts, quarantine, right-censored
  signals, report slots, or a human-only decision ledger. Route Agent Pulse itself
  to agent-pulse, general dataset interpretation to data-analysis, and generic
  service telemetry to monitoring-observability.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Bundled offline audit requires Node.js 20+ and local regular files. No package
  installation, vendor credentials, API client, database, or browser is required.
  A real MI checkout and independently approved data access are needed to run a pipeline.
metadata:
  version: "1.0"
  source: user-provided-mi-orchestration-flow.html
  tags: market-intelligence, mobile-games, data-lineage, reproducibility, health-gates, backfill, human-decisions
---

# MI orchestration

기본 작업은 **읽기 전용 감사 또는 재개 계획**이다. 첨부 흐름도는 설계 입력이지
운영 실적이나 실행 가능한 코드가 아니다. 이 스킬은 원본 `st-pipeline.py`, 벤더
collector, Slack 연동, `/mi-decide`를 제공하지 않는다. 숫자·날짜·호출량 예시는
계정과 회차에서 다시 확인하고, 결정을 데이터 재빌드로 덮어쓰지 않는다.

## When to use this skill

- 주간 MI 리포트의 `raw → core → mart → health → signals → render/inbox` 계보를 설계·감사한다.
- 중단된 회차의 최신 증거와 재개 가능한 가장 작은 경계를 찾는다.
- weekly와 backfill, 결측과 0, 추정치와 실제값, 후보와 인간 결정을 구분한다.
- coverage/flip hold, quarantine, right-censoring, 보고서 슬롯, human-only 원장을 검토한다.

단순 분석은 `data-analysis`, 일반 모니터링 설계는 `monitoring-observability`,
`barretlee/agent-pulse` 운영은 `agent-pulse`가 소유한다. 새 지속 지식 저장소는
`llm-wiki`에 맡기고 이 스킬에서는 MI 근거와의 연결 계약만 남긴다.

## Instructions

### 1. 작업 한 묶음을 고정한다

`design`, `audit-run`, `resume-plan`, `decision-review` 중 하나를 고른다.
정확한 checkout/root, 회차·데이터 기간, mode, 원본 코드 revision, config,
보존된 raw, 원하는 결과, 외부 부작용·예산, 승인 주체를 적는다. 날짜 혼재,
수치 모순, 미확인 schema/권한은 추정하지 않고 별도 공백으로 남긴다.
[첨부 분석](references/flowchart-audit.md)을 읽되 프로젝트 파일과 명령은 실제 checkout에서 확인한다.

### 2. 수집 권한을 먼저 분리한다

[벤더 경계](references/collector-boundaries.md)를 읽는다. 공식 API 존재, 계정
entitlement, 사용자의 이번 회차 실행 승인, 결과 이용·공유 권한은 별도다.
Sensor Tower의 Call Credits와 request 수를 같은 단위로 합산하지 않는다.
현행 Sensor Tower 약관은 bots/crawlers/브라우저 확장 자동 접근을 금지한다.
옛 Playliner 약관은 역사 자료로만 보고 현행 계약과 승인된 인터페이스를 확인한다.
Service Data를 AI에 입력하기 전 **Permitted AI Tool**의 서면 데이터 처리 계약·관리 통제·
비소비자/비무료/비공유 환경을 확인한다. 학습·fine-tuning·distillation은 금지다.
`API=0`도 웹 UI 자동화·내부 endpoint·좌석·데이터/AI 사용 권한을 면제하지 않는다.
권한 미확인은 `blocked`; 다른 계정/벤더/웹세션으로 자동 fallback하지 않는다.

### 3. 실제 데이터 계보를 결박한다

[데이터 흐름 계약](references/data-flow-contract.md)을 따른다. 각 산출물에 run/period,
platform·entity namespace·country·unit, source interval·observation time, 입력 bytes hash,
code/config/schema 버전과 변환을 연결한다. **설계 DAG와 실행 receipt를 따로** 기록한다.
raw는 계약상 허용된 기간·환경 안에서 run별로 보존한다. 만료·삭제 의무를 불변성으로
우회하지 않고 `.prev`나 mtime만으로 재현성을 주장하지 않는다.
core는 원천에서 재생성하는 파생 데이터이며 인간 원장은 별도 append-only 저장소다.
결측을 0으로 바꾸거나 LLM으로 숫자를 채우지 않는다. 추정 지표는 `estimate`로 표시한다.

### 4. 건강성·backfill·결정 게이트를 지킨다

coverage 분모와 previous-week flip 정의·threshold를 config와 측정 근거에서 읽는다.
첨부의 80%, 10 같은 예시를 공통 기준으로 쓰지 않는다. 실패·hold·quarantine이면
정상 signals/render를 금지하고 부분 수집·원인·다음 행동이 담긴 inbox만 남긴다.
backfill은 특정 weekly-window 검사만 제외할 수 있다. 데이터 유효성·권한·계보·빈 입력은
무시하지 않는다. **정의된 follow-up outcome의 관측 종료가 잘린 경우만** right-censored
후보와 reason으로 표시한다. 부분월 집계나 일반 결측은 incomplete/missing + reason이며,
완결된 historical backfill을 censored로 바꾸지 않는다. 경보 재시도는 명시한 회차 예산 내
최대 1회이며 인증·금지·한도 소진은 재시도하지 않는다.
[운영·인간 게이트](references/operations-and-decisions.md)를 적용한다. 후보 제안,
peer review, readiness와 실제 accept/kill/hold/closed 기록은 별개다.

### 5. 읽기 전용 도구로 감사·재개 계획을 만든다

[로컬 audit 계약](references/audit-cli.md)을 읽고 **미리 존재하는** manifest를 검사한다.
실행 뒤 수동 manifest를 만들거나 파일을 touch해서 과거 실행을 검증했다고 보고하지 않는다.
번들 형식은 원본 MI 파일을 직접 읽는 adapter가 아니다. 실제 프로젝트 receipt를
별도 변환할 때도 그 변환의 출처와 한계를 남긴다.

```bash
# Installed skill directory 기준. 이 예시는 합성 fixture이며 벤더 호출이 없다.
node scripts/mi-audit.mjs check --root assets/example --manifest manifest.json
node scripts/mi-audit.mjs plan --root assets/example --manifest manifest.json
node --test scripts/mi-audit.test.mjs
```

`plan`은 실행하지 않는다. hashes·input fingerprints·기간·구조를 통과해도 통계적
타당성, 실측의 진실성, 콘텐츠/브라우저 QA, 수집 허가나 인간 승인을 인증하지 않는다.
source/config가 달라진 경계부터 downstream을 stale로 보고, 최신 부모 없는 재개는 막는다.
실제 deterministic rebuild나 유료 재수집은 별도 승인과 실제 프로젝트 명령 확인 뒤에만 한다.

### 6. 검증 범위를 포함해 인계한다

한 결과를 다음처럼 반환한다:

- mode, run/period, root/revision 및 읽은 증거 범위;
- 단계별 `verified / stale / hold / fail / blocked`와 최초 깨진 계보;
- source→지표→signal→슬롯→인간 판단의 근거 링크, quarantine/censoring;
- API requests와 credits·비용을 분리한 사용량 또는 `not-executed / unknown`;
- 검증 명령·실제 종료코드, artifact integrity와 분석/콘텐츠/권한 검수의 구분;
- 가장 작은 재개 경계, 승인·측정·파일 공백 및 명시적 다음 행동.

실행 성공, 예약 active, JSON `pass`, 사람이 아닌 에이전트 리뷰를 인간 결정으로 승격하지 않는다.

## Examples

**주간 hold:** coverage가 설정 기준 미만이다. 유효한 부분 결과와 quarantine을 보존하고
signals/render를 skip한다. inbox에 관측 범위·원인·다음 행동을 남기며 추가 수집은 승인받는다.

**오래된 보고서 재개:** raw 또는 config bytes가 바뀌었다. 이전 HTML의 최신 mtime을
무시하고 최초 input fingerprint 불일치부터 재개 후보를 찾는다. 부모 검증 전에는 실행하지 않는다.

**backfill 후보 검토:** 한 달 집계가 덜 찼다. 빈 데이터는 차단하고 관측 가능한 분모·기간과
incomplete/missing reason을 남긴다. 정의된 follow-up outcome이 관측 종료 시점에 미관측일
때만 right-censored `candidate`로 표시한다. 인간 원장 accept로 자동 승격하지 않는다.

## Best practices

- 불변 snapshot, 데이터/코드/config의 버전, 계산 정의를 함께 보존한다.
- `bluf`, `wave`, `insight` 슬롯은 구조 검사 후 실제 렌더와 수치·서술을 별도로 검수한다.
- 인간 원장·제품 실행·외부 알림은 수집/분석의 자동 완료 조건에 묶지 않는다.
- 합성 fixture PASS는 실제 벤더 수집·시장 성과·운영 재현성 증거가 아니다.

## References

- [첨부의 전체 범위와 채택·보류 판단](references/flowchart-audit.md)
- [계보·재현성·지표 계약](references/data-flow-contract.md)
- [Sensor Tower·Playliner 공식 수집 경계](references/collector-boundaries.md)
- [재개·상태·인간 결정 계약](references/operations-and-decisions.md)
- [읽기 전용 CLI와 fixture schema](references/audit-cli.md)
- [1차 출처 조사 및 한계](references/primary-source-research.md)
