# Primary-source research and proposal boundaries

조회일: **2026-10-12, Asia/Seoul**. 데이터 설계는 공식 문서 10개를 실제 열람한 독립 조사로,
벤더는 공식 제품 문서·약관을 조사하고 부모 검토에서 현재 TOS/DAS/AI PDF 전문을 대조했다.
아래 원칙은 source-supported facts와 MI에 제안하는 계약을 구분한다. source 공개 문서의
열람은 vendor 계정·현재 Order Form·프로젝트 실행 검증을 뜻하지 않는다.

## Data lineage and operations

| 근거 | 직접 확인한 내용 | MI 적용 제안 / 한계 |
| --- | --- | --- |
| [OpenLineage Object Model](https://openlineage.io/docs/spec/object-model) | Run은 Job의 instance; design-time Job/Dataset events는 run에 묶이지 않음. Dataset namespace/name, runtime input/output facets, 저장소 제공 version facet. 조회 문서 표시 1.53.0. | 실제 run/attempt·입출력·partition을 기록. DAG만으로 실행 증거 아님; 저장소 없는 version을 자동 생성하지 않음. |
| [Databricks Medallion](https://docs.databricks.com/aws/en/lakehouse/medallion) | raw/history bronze, validated silver, business aggregates gold; best practice이지 필수 규격 아님. invalid-record quarantine·late/out-of-order examples. | raw/core/mart 대응은 유용. 전체 7단계·WORM·영구보존·인간 원장 정책을 이 문서의 의무로 말하지 않음. |
| [Airflow Best Practices](https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html) | tasks를 transaction처럼 취급, 재실행 동일 outcome, 고정 partition, latest/핵심 계산 now 회피, downstream self-check. | pinned inputs/config/runtime와 validated checkpoint 제안. 실제 task 순수성·bytes 동일성은 코드/실행 검수 필요. |
| [Dagster Asset versioning/caching](https://docs.dagster.io/guides/build/assets/asset-versioning-and-caching) | code/input versions로 data version hashing; RNG·cosmetic code changes caveat. “Unsynced status is not transitive in Dagster.” | MI의 transitive stale 전파는 **제안**. actual output SHA는 fingerprint와 별개; hash에서 빠진 dependency는 못 탐지. |
| [AWS Idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs) | caller request id, 동일 id의 다른 parameters 거부, token 기록과 mutation 원자성, retention/late requests. | run/content dedup과 외부 side effect intent dedup 분리. 지원 없는 vendor에 external exactly-once 선언 금지. |
| [AWS Timeouts/retries/backoff](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter) | retries 상한, 여러 계층 retry의 곱셈 부하, timeout이 무부작용을 증명하지 않음, jitter. | MI 회차 최대 1회는 정책 선택. 보편 시간·횟수의 공통값 아님; 정책·인증 실패는 retry 금지. |
| [PostgreSQL 18 aggregates](https://www.postgresql.org/docs/18/functions-aggregate.html) | count(*)와 count(expr)의 null 처리 차이; no-rows sum은 null, not zero. coalesce는 가능. | observed zero와 unknown/no-data 구별, 분모0 rate 보류. 도메인 결측의 원인·population 완전성은 SQL이 증명하지 않음. |
| [NIST Censoring](https://www.itl.nist.gov/div898/handbook/apr/section1/apr131.htm) | 고정 관측시간 뒤의 failure time 미관측은 right-censored. | reliability/time-to-event 맥락. MI의 정의된 follow-up outcome에 관측 종료가 잘린 경우만 사용; 모든 결측이 censoring 아님. |
| [Microsoft Event Sourcing](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) | append-only system of record, replay projections, compensating events, concurrency/idempotent consumers, 개인정보 삭제·복잡성 caveat. | 제한적 human ledger에 적용 가능. 전체 MI event sourcing 의무 아님; append-only만으로 tamper resistance나 human authenticity 보장 안 됨. |
| [NIST AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf) | GOVERN 3.2 roles/responsibilities, MAP 3.5 oversight, human judgment threshold. PDF 실제 p17/28/32/45, 인쇄 p12/23/27/40. | human-only decision은 이 MI의 **정책 선택**. NIST가 모든 AI final decision을 사람이 해야 한다고 요구하는 것은 아님. |

`health`, `hold/quarantine/backfill`, transitive fingerprints, fresh-byte receipts, human-only ledger의
정확한 schema·topology는 위 근거를 조합한 **제안 계약**이다. 첨부의 실제 Python 구현·현재 수치,
80%·flip<10·counts/dates는 검증하지 않았다. hash는 무결성만, row count는 receipt 구조만 보장한다.

## Vendor and AI data handling

| 근거 | 증거 수준·내용 | 적용 / 미확인 |
| --- | --- | --- |
| [Sensor Tower Connect](https://sensortower.com/product/connect) | 공식 본문: API/feeds/Snowflake/alerts 전달 옵션 | 계정 entitlement와 credits는 Order Form 확인 필요 |
| [Current Terms of Service](https://sensortower.com/tos) | **14쪽 PDF 전문 확인**. p1 과거 Playliner OY 등 계약 superseded; §2C p3 internal/third-party/AI scope; §3M p4 bot/crawler/browser-extension 자동 access/scrape 금지 | 웹 UI automation을 API 대체로 취급하지 않음. 실제 계정 계약은 미확인 |
| [DAS Supplement](https://sensortower.com/tos-data-access-service-supplement) | **v1.2, 2쪽 PDF 전문 확인**. §1A call별 1개 이상 credits; §1B Order Form limit; §2C approved interfaces; §2D AI Supplement; §3B 만료/no-rollover; §3D overage; complimentary도 제한 | 6 req/s·39/51 requests·112 endpoints·limit0는 근거 없음; request≠credit≠money |
| [AI Supplement](https://sensortower.com/tos-ai-supplement) | **v1.4, 2쪽 PDF 전문 확인**. §1 Permitted AI Tool 서면 no-use/retain/distill/train, admin controls, no consumer/free/shared; §2 inference-only, training/distillation 금지, RAG와 report 공유조건, AI environment deletion | API권한이나 `API=0`로 AI compliance 면제 안 됨. 실제 AI provider 계약·retention·Order Form 미확인 |
| [Responsibly Sourced Data](https://sensortower.com/responsibly-sourced-data) | 공식 공개 설명: panel/first-party/public sources, 모델링, 100% 대표성 불가 | actual revenue/downloads로 표현하지 않음 |
| [App Performance Insights](https://sensortower.com/product/mobile-app/app-performance-insights) | 공식 제품 FAQ: downloads/revenue/usage estimates와 proprietary modeling | 지표 grain/상품/국가/기간·update/method caveat 보존 |
| [Playliner Live Ops](https://sensortower.com/product/live-ops) | 공식 현재 본문: top-game playtime/events/updates/offers 표본. parent live fetch로 old terms URL의 제품 페이지 연결 확인 | 공개 API/export entitlement는 확인 못함; population 완전성 SLA 아님 |
| [Old Playliner Terms](https://playliner.com/policies/terms_of_use) | **역사 검색 발췌만**. 2022-10-24 §6.6 자동 다운로드 금지. 현재 URL은 marketing으로 연결 | 현행 정본으로 쓰지 않음. 현재 automation 판단은 Sensor Tower §3M와 실제 계약에 근거 |

수집 권한, AI 환경 허용, 원본/파생 data·Outputs 보존, 외부 report 공유는 독립 게이트다.
이 연구는 실제 licensed payload를 읽거나 업로드하지 않았고, 실제 vendor call·계정 변경·AI provider
compliance 인증을 수행하지 않았다. public terms PDFs는 근거 자료이며 Service Data fixture가 아니다.

## Validation scope

- 본 스킬의 Node tool: 미리 존재하는 local receipts의 bytes·dependency·structure 검사/계획만.
- 실제 계정/코드/데이터: 미검증. 합성 fixture 테스트를 live correctness로 승격하지 않는다.
- 보고서 내용/렌더, 인간 결정 authenticity, 권한/AI 계약, 모델 성능: 별도 검수.
- 모든 웹 URL은 관측 시점의 source며 변경될 수 있다. 재사용 시 현행 공식 계약·문서 revision을 확인한다.
