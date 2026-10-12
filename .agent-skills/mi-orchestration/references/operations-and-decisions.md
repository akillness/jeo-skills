# Run, resume, and human decision contract

이 상태 모델과 human-only ledger는 MI 정책 제안이다. NIST가 모든 AI 시스템에 동일한
결정권 구조를 법적으로 의무화했다고 설명하지 않는다. 역할은 책임 경계로 선택하며 첨부의
에이전트 수만큼 프로세스나 서비스를 새로 만들 필요는 없다.

## Role separation

- orchestrator: scope/run/period/mode 고정, dependency와 예산 관리; source 사실이나 결정권을 만들지 않는다.
- collector owner: 계약·data/AI 권한 확인, 허용 interface만 실행, raw/usage receipts 보존.
- data steward: normalization·grain·unit·time/revision·missing/invalid 상태 관리.
- analyst: deterministic mart, 후보·가설·반증조건, 모델/실측/추정치 범위 구분.
- verifier/reviewer: 다른 run의 PASS를 빌리지 않고 실제 bytes·수치·내용·렌더를 독립 검수.
- human decision owner: 인가된 사람으로서 accept/kill/hold/closed와 rationale를 원장에 기록.

같은 사람이 여러 역할을 맡을 수 있지만 recommendation과 결정 저장소의 authority는 분리한다.
agent/subagent, config flag, `ship-ready` token은 사람의 승인 증거가 아니다.

## Stage outcomes

`pass`는 해당 검사 범위의 성공이다. `hold`는 승격 중지, `fail`은 실패, `skip`은 실행하지 않음이다.
`stale`은 현재 input/config/partition에 맞는 결과로 재사용할 수 없음이며 이전 실행 실패와 다르다.
`blocked`는 권한·입력·의존성·필수 검수 등이 부족해 진행할 수 없음이다.

| 상황 | 정상 signals / render | 보존·인계 |
| --- | --- | --- |
| 모든 부모 검증 + health pass | 후보 생성·정상 리포트 검토 가능 | 현재 run 근거와 별도 content/visual QA |
| coverage/flip hold | 금지, `skip` | 유효 부분 데이터·quarantine·hold inbox |
| source 일부 실패 / malformed / empty | 미충족 부모 아래 금지 | 실패 collector와 성공분을 분리, null로 0 보충 금지 |
| 바뀐 config/source/output | 해당 경계부터 stale | 이전 run 결과는 과거 evidence로만 보존 |
| backfill 불완전 window | 기본 유효성 통과 뒤 후보만 | 아직 관측이 종료되지 않은 **정의된 outcome**은 right-censored + reason |
| 모호한 외부 side effect timeout | 새 실행 금지 | 같은 operation 상태를 reconcile, 중복 전달/수집 방지 |

수치값 자체가 observed zero일 수는 있지만 수집 유효행 0건은 성공한 시장의 zero activity가 아니다.
모든 missing data를 censoring이라 부르지 않는다. NIST 근거는 time-to-event reliability 문맥이며
MI에서는 어떤 outcome의 관측 종료가 잘렸는지 먼저 정의해야 한다.

## Retry and resume

1. 최신 manifest/artifact와 bytes, 기간·config·pipeline version을 읽는다. 실행 receipt가 없으면
   과거 run 완료를 인증할 수 없다. 지금 만든 summary는 지금의 조사 기록일 뿐이다.
2. 최초 깨진 dependency부터 계획한다. 성공·최신 prefix는 유지한다. `pass` 문자열이나
   보고서의 새 mtime만 보고 downstream부터 실행하지 않는다.
3. 수집 재시도와 deterministic transform 재빌드를 구분한다. 승인된 transient 수집만
   회차 최대 1회, config 예산이 0이면 0회. credential/policy/quota 문제는 자동 retry 금지.
4. 계획에는 node, 사유, 최신 부모 필요조건, side effect/예산, 필요한 승인, 검증 결과를 남긴다.
5. 실제 실행은 별도 scope-matched 승인과 원본 프로젝트 command 확인 뒤 한다. 번들 `plan`은
   실행하지 않고, retry count나 원장을 바꾸지 않는다.
6. 새 실행과 재실행은 attempt/intent ids를 보존한다. external service가 idempotency token을
   지원하지 않으면 exactly-once를 주장하지 않는다. read-only audit와 side-effect reconciler는 별개다.

## Weekly and backfill

weekly는 완성된 비교 window와 baseline 정책을 검수한다. backfill은 지정된 historical period를
같은 snapshot/code/config로 재처리하는 mode다. backfill이 source 최신화나 quarantine release,
원장 정정의 자동 승인은 아니다. coverage/flip **window 정책** 예외만 허용할 수 있고
schema·빈 input·권한·actual bytes·null/0·downstream freshness는 반드시 유지한다.

threshold는 owner와 적용범위가 승인한 config다. bundled example의 threshold는 합성 테스트값이다.
이 패키지의 단순 health payload는 집계 receipt를 검수하며 원본 metric truth를 직접 계산하지 않는다.

## Human-only ledger

결정 event에 최소한 `decision_id`, subject/candidate id, 인가된 actor, decided_at, evidence
run/manifest digest, recommendation id, expected sequence, decision, rationale를 기록한다.
원본 프로젝트가 accept/kill/hold/closed를 쓰면 그 enum 의미를 확인하고 임의로 번역하지 않는다.

- 판단 이후 새 관측/모델 추천이 나오면 **새 recommendation**을 만들고 과거 결정과 연결한다.
- 정정·철회는 append한 새 event로 `supersedes/compensates`를 남긴다.
- expected sequence mismatch는 conflict다. 자동 last-write-wins나 retry로 사람 판단을 덮지 않는다.
- replay는 read projection만 재생성한다. Slack/email/webhook/제품 실행 같은 side effect를 재발송하지 않는다.
- recommendation, peer review, readiness, inbox acknowledgment, human decision, product ship은
  각각 별도 상태다. 하나의 `done`으로 합치지 않는다.
- ledger를 core에서 재빌드하거나 files `pass`만 보고 사람 승인을 인증하지 않는다.
- 계약 만료의 데이터/AI environment 삭제와 개인정보 보존정책을 지킨다. source raw 자체를
  ledger에 복사하기보다 허용된 evidence reference·digest와 필요한 최소 rationale를 보존한다.

## Report and inbox checks

`bluf`, `wave`, `insight` slots에 현재 run의 source·수치·reason을 연결한다. 구조 검사 후
실제 렌더에서 누락, placeholder, 흐려진 수치, censored/estimate 표시를 확인한다. 서술과
숫자의 grain·기간·unit·source가 동일한지 별도로 검토한다. 공개/제3자 공유는 vendor/AI Output
계약과 사용자 승인까지 충족해야 한다. inbox 생성은 전달·읽음·의사결정의 증거가 아니다.

합성 fixture로 관찰한 no-op plan과 회귀 테스트 결과는 live MI 운영 성공이나 수집 허가,
실제 시장 효과, 데이터의 과학적 타당성 증거로 쓰지 않는다.
