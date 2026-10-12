# Attached flowchart audit

## Provenance and scope

- 분석 입력: 사용자 첨부 `mi-orchestration-flow.html`; SHA-256 `d24a106c03e8302fbdc96b85263fcad7ec03f713c0474298a3a67a428f0ea775`.
- 분석일: 2026-10-12. 원본 HTML은 배포하지 않고 데이터 흐름·운영 경계를 재사용 가능한 계약으로 재작성했다.
- 첨부의 정적 `N`/`E` 정의 전체: **73 nodes / 159 edges**, 미정의 endpoint 0. kind 집계: trigger 1, command 4, agent 18, cli 12, gate 4, queue 2, artifact 32.
- UI가 말하는 에이전트 총수와 정적 `agent` node 수는 같은 집계로 보장되지 않는다. 누락된 에이전트를 추정해서 채우지 않는다.
- 표시된 운영 날짜, 주차, calls, rows, threshold, endpoint 수는 문서 속 관측/예시다. 실제 프로젝트 소스·계정·현재 실행은 이번 작업에서 접근하지 않았다.

## Full-flow decomposition

| 첨부의 책임 경계 | 재사용 계약 | 이 스킬의 처리 |
| --- | --- | --- |
| schedule/명령/오케스트레이터 | period/mode/run intent, topological dependencies | 설계와 실행 receipts를 분리; 예약만으로 수집/발행 성공 판단 금지 |
| API 조사·쿼터·내부 catalog | vendor/product/account entitlement, requests와 credits 예산 | 공식 근거와 계약 확인; 첨부의 6 req/s·39/51 calls·112 endpoints·quota 0은 미검증 |
| Sensor Tower, Playliner 수집 | 권한 있는 collector → immutable raw | collector는 번들하지 않음; 벤더 웹 UI 자동 다운로드는 차단 |
| raw 및 `.prev` | run별 원본 bytes, 관측/자료 기간, source metadata | `.prev`만으로 역사 재현 불가; 새 run을 별도 보존 |
| normalization/core/history | 식별자·기간·단위 정합성, 유효 행·중복·누락 | 원천에서 재생성; 인간 결정과 물리적/논리적으로 분리 |
| mart/calculation | 순수 지표·집계, 계산 정의·input/config/code signature | 결과를 실제 source 추정치와 결박; 모델로 숫자 창작 금지 |
| health/coverage/flip/quarantine | project-local denominators & threshold, blocked reasons | 예시 80%/10 일반화 금지; 실패/hold에서 normal report 금지 |
| wave/structural/meta signals | evidence-linked candidate, uncertainty/censoring | 부분월·결측은 incomplete/missing + reason; 정의된 follow-up outcome의 관측 종료가 잘릴 때만 right-censored 후보; accept 자동 승격 금지 |
| BLUF/Wave/Insight, HTML/report | stable slots, numeric/evidence binding, visual QA | 구조 검사와 내용·브라우저 검수를 별도 수행 |
| inbox/retry/알림 | 부분 성공 보존, 원인·다음 행동, bounded retry | 정상 경로와 hold alert 분리; 외부 알림·재수집은 별도 승인 |
| hypothesis/retro/calibration | 가설→반증조건→관측기간→사후 검증 | 측정되지 않은 uplift/확률을 만들지 않음; calibration은 공통 정의가 있을 때만 |
| peer review/ship-ready | 제안 품질·gate 판단 | review는 human accept/kill/hold/closed 결정이 아님 |
| human decision ledger | 사람이 결정한 상태 변경의 append-only 기록 | 재빌드로 overwrite 금지; 이름이 `/mi-decide`라는 이유로 명령이 존재한다고 추정 금지 |
| PM/P0/제품 handoff | 원장에 연결된 제품 우선순위·실행 요청 | MI 후보를 자동 product ship/roadmap 결정으로 전환하지 않음 |
| wiki/FAQ/장기 context | source/run/decision ids 연결 | MI 밖 지식 저장소 구현은 `llm-wiki`에 위임; 사실과 가설을 분리 |

모든 agent/CLI/artifact node는 위 책임 경계로 묶어 다룬다. 원본 이름·경로·개수는
실제 checkout inventory로 확인하기 전 실행 명령, 정확한 schema 또는 지원 기능이라고 말하지 않는다.

## Adopt / modify / hold

**Adopt:** raw→core→mart 계보, deterministic numeric transforms, health-before-signal,
partial-run inbox, 후보와 결정 분리, stable report slots, evidence-linked peer review.

**Modify:** 재현성을 `.prev`나 code hash 하나가 아닌 run별 bytes·config·schema·환경에 결박;
backfill은 window-limited 예외만 허용; 자동 retry는 최대 1회지만 금지/인증/quota 오류는 즉시 중지;
인간 원장을 core 재생성 범위에서 제외; immutable history를 current pointer와 분리.

**Hold / reject:** 검증되지 않은 rate/count를 기본값으로 고정; Playliner browser crawl과
비공개 endpoint 자동 fallback; API=0를 무료·권한면제로 읽기; LLM 수치 보충; 후보/리뷰를
인간 결정으로 쓰기; 오래된 artifact의 mtime 또는 `pass`만으로 완료 선언.

## Original commands are not bundled adapters

첨부의 Python/에이전트/slash commands는 프로젝트 내부 인터페이스 예시다. 이 패키지는
stdlib Node audit/plan CLI만 제공한다. 원본 코드, 계정 또는 adapter가 없는데 원본 운영을
완료했다고 보고하지 않는다. 실제 파이프라인을 실행하는 별도 작업에서는 먼저 checkout의
`--help`, schema, side effects, 허용된 데이터 경로와 human authority를 확인한다.
