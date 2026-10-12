# Data flow and lineage contract

이 파일의 `must`는 이 스킬이 제안하는 **MI 운영 계약**이다. 벤더나 OpenLineage가
모든 조건을 의무화했다고 주장하지 않는다. 근거와 한계는 `primary-source-research.md`에 있다.

## One lineage, two planes

```text
licensed input → raw snapshot → normalized core → analytical mart → health
                                                            ↓        ↓
                                                        candidate signals
                                                            ↓
                                                 report slots + internal inbox

candidate + evidence + reviewer recommendation → HUMAN → decision ledger
                                                      ↓
                                           approved product/wiki handoff
```

data plane은 관측과 파생 지표를 만든다. decision plane은 사람이 결정한 변경 이력을
별도 저장한다. core를 raw에서 재생성해도 decision ledger는 삭제·초기화·추론되지 않는다.
같은 database를 쓴다면 table ownership, append-only permissions, backup/restore 범위를 분리한다.
인간 원장을 포함한 전체 DB를 `rebuild`하는 구현은 안전한 core rebuild라고 부르지 않는다.

## Artifact identity

각 데이터·실행 receipt에 최소한 다음 필드를 유지한다. 비밀키·세션 cookies는 넣지 않는다.

- run id, stage/job id, mode, 데이터 period 및 관측시각(timezone 포함);
- source/vendor/product/dataset, license/entitlement evidence reference, access method;
- platform (`ios`/`android`/`unified` 등 실제 namespace), entity id, country/store/genre;
- metric, `estimate`/`observed` 구분, unit/currency, gross/net 범위, aggregation/window;
- schema revision, pipeline/code revision, **resolved config**, runtime/dependencies;
- immutable input/output paths 또는 dataset version, actual bytes SHA-256;
- row counts, expected population/window, invalid/duplicate/quarantined ids;
- stage start/end/outcome, retry attempt, error category, actual inputs consumed;
- optional random seed/model/prompt/version, source refresh/model-change note.

ISO week는 실제 달력상 존재하는 주차만 허용한다. 데이터 기간과 retrieval/observation time,
그 주차를 계산하는 timezone을 혼동하지 않는다. 수집일이 최근이어도 자료 period가 옛날이면
fresh current-week data가 아니다. HTTP 성공만으로 payload 완전성을 보장하지 않는다.

## Transform boundaries

### Raw

요청/전달·보존이 허용된 source bytes를 run-specific snapshot으로 저장한다. 계약상 retention과
종료/개인정보 삭제 의무는 불변성으로 우회하지 않는다. AI 사용·공유 환경도 별도 승인받는다. current pointer나
`.prev`는 편의용일 뿐 immutable history를 대신하지 못한다. upstream 응답 수정·재시도는
새 observation/attempt로 기록한다. 요청 실패와 성공한 부분 수집은 따로 보존한다.

### Core

키를 `(namespace, entity_id, country, metric, interval)` 같은 명시된 grain으로 정규화한다.
단일 순위와 두 platform 합산, title 문자열과 stable id를 무조건 join하지 않는다.
확정되지 않은 mapping은 unmatched로 남긴다. 늦게 도착한 자료는 기존 관측을 가리지 않고
수정 사유·버전을 기록한다. raw 재빌드는 파생 core만 대상으로 한다.

### Mart

순수 계산이 가능한 최소 transform을 유지한다. null, unavailable, not-collected, permission
blocked는 0이 아니다. 분모가 0이거나 단위/기간/모델이 불일치하면 계산을 보류한다.
순위 변동과 estimated revenue 증가는 별개 지표다. 시간차와 선택 편중만 있는 데이터로
live-ops 이벤트가 매출 상승의 원인이라고 단정하지 않는다.

### Health

coverage는 `valid eligible rows / expected eligible rows`처럼 분모까지 정의한다.
수집 성공 수, 유효행 수, 대상 population, region/product coverage를 구분한다.
previous-week flip의 비교 baseline, 비교 가능 entity set, threshold equality 정책을 고정한다.
health failure는 내용 생성 중 LLM 보정으로 해결하지 않는다. quarantine은 격리 상태이며
인간 검토/정정 근거 없이 자동 release하지 않는다.

### Signals and report

각 candidate는 source artifact/행 키, 측정 기간·계산 정의, factual observation, 해석,
불확실성, 반증 조건과 다음 관측을 포함한다. observational correlation은 인과 효과가 아니다.
report의 BLUF·Wave·Insight에는 같은 run의 숫자/근거만 넣는다. missing slot/placeholder는
렌더 실패이며, 구조가 맞아도 내용 검수·실제 화면 검수는 별도다.

## Reproducibility and invalidation

- `same code`는 충분하지 않다. input bytes/config/schema/runtime와 난수·외부 서비스를 기록한다.
- 모델·dependency·동적 source를 고정하지 못하면 reproducibility를 `partial`로 보고한다.
- 설계 lineage와 실행 lineage를 분리한다. 실제 실행하지 않은 DAG 그림은 실행 증거가 아니다.
- content hash와 upstream output hash가 바뀌면 해당 stage부터 downstream을 stale로 판단한다.
- mtime은 freshness 보조 조건이다. 새 mtime만으로 source fidelity나 새 실행을 입증하지 않는다.
- 결과 hash 일치는 bytes 무결성을 뜻할 뿐 source 허가, 실측 정당성, 인간 승인은 증명하지 않는다.
- 재개에서는 성공한 최신 prefix를 보존하고 최초 깨진 dependency부터 새 attempt를 제안한다.
  최신 부모가 없으면 downstream부터 다시 돌리지 않는다.

실제 production system이 이 계약을 충족하는지는 실제 checkout·권한·receipts를 봐야 한다.
번들 checker는 fixture receipt의 무결성·구조만 확인하고 지표의 과학적 타당성을 재평가하지 않는다.
