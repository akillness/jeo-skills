# Read-only audit CLI

## Scope and commands

`mi-audit.mjs`는 Node.js 20+ stdlib-only **offline receipt checker**다. 네트워크,
subprocess, 설치, pipeline 실행, 상태/원장/파일 쓰기를 하지 않는다. JSON 한 줄을 stdout에
내며 오류에는 경로·원문·credentials를 포함하지 않는다. 실제 vendor payload를 AI에 넘기는
권한을 제공하지 않는다. licensed data의 data/AI 계약은 먼저 별도 확인해야 한다.

Installed skill directory에서:

```bash
node scripts/mi-audit.mjs --help
node scripts/mi-audit.mjs check --root assets/example --manifest manifest.json
node scripts/mi-audit.mjs plan --root assets/example --manifest manifest.json
node --test scripts/mi-audit.test.mjs

# 실제 root를 쓰는 경우 existing receipt와 허용된 local 데이터만 검사한다.
# 아래 경로/시각은 예시다. 자동으로 파일을 만들거나 수집하지 않는다.
node scripts/mi-audit.mjs check --root /absolute/approved-run --manifest manifest.json \
  --since 2026-10-12T00:00:00+09:00
```

root와 manifest는 필수다. 알 수 없는/중복 flag와 잘못된 ISO 시각은 exit 2.
`--since`는 출력 파일 mtime만 비교한다. source의 자료 기간, original execution time,
provenance를 새 mtime이나 `touch`로 인증하지 않는다.

| Exit | 뜻 |
| --- | --- |
| 0 | `verified` integrity/structure 또는 모든 node `no_op` plan |
| 1 | `stale` / `blocked`; 올바른 hold도 human review가 필요하므로 1 |
| 2 | invalid schema/path/flag/JSON, missing file, read error |

모든 result는 `verification_scope: artifact-integrity-and-structure-only`,
`authority: not-certified`, limitations를 포함한다. 성공한 fixture는 synthetic일 뿐이다.

## Manifest v1

전체 작동 예시는 `assets/example/manifest.json`과 대응 파일들이다. 핵심 필드:

```json
{
  "schema_version": 1,
  "run_id": "existing-run-id",
  "period": "2026-W42",
  "mode": "weekly",
  "pipeline_version": "declared-code-and-policy-version",
  "config_path": "config.json",
  "retry_count": 0,
  "sources": [{"path": "raw-source.json", "sha256": "<actual 64 lowercase hex>"}],
  "stages": {
    "collect": {"status": "pass", "input_sha256": "<fingerprint>", "outputs": [{"path": "collect.json", "sha256": "<actual hash>"}]}
  }
}
```

위 축약 snippet은 단독 실행용이 아니다. **7 stage key가 모두** 필요하며 추가 stage는 금지한다.
`period`는 실제 달력상 존재하는 ISO week, `mode`는 weekly/backfill이다. pipeline_version은
선언된 문자열이고 실제 소스 코드의 revision·runtime authenticity를 이 도구가 인증하지 않는다.

| Stage | Ordered parents |
| --- | --- |
| collect | sources 선언 순서 |
| build_core | collect |
| build_mart | build_core |
| health | build_mart |
| signals | build_mart, health |
| render | build_mart, health, signals |
| inbox | health, signals |

stage: `status` = pass/hold/fail/skip, `input_sha256`, `outputs[{path,sha256}]`.
skip의 outputs는 반드시 `[]`; fail은 0개 이상 output을 기록할 수 있지만 성공 재사용 불가.
정상 collect/core/mart/inbox는 pass이어야 한다. health는 pass/hold, health hold이면
signals/render는 skip이고 inbox는 부분 alert를 위한 pass다. 어떤 실패도 result를 성공으로
만들지 못한다. 정상 signals/render/inbox와 health JSON은 각각 output 1개를 요구한다.

### Fingerprint definition

UTF-8 compact `JSON.stringify(tuple)`의 SHA-256:

```text
[pipeline_version, actual_config_file_sha256, period, mode, stage_name,
 ...ordered_actual_upstream_output_sha256]
```

collect만 upstream outputs 대신 sources actual hashes를 쓴다. config, source, output의
**실제 bytes**를 읽어 hash를 계산하며 manifest의 declared hashes와 대조한다. ordered parents와
각 stage의 output 선언 순서를 보존한다. 변경된 부모의 `fresh_pass`가 downstream에 전파된다.

이 hash schema는 본 패키지의 receipt 계약이며 OpenLineage/Dagster 기본 schema가 아니다.
동일 bytes·합법 수집·원래 run의 저자·원본 code 실행을 하나의 fingerprint로 증명하지 않는다.

## Config and typed outputs

config 예시 `min_coverage: 0.75`, `max_previous_week_flips: 3`, `retry_limit: 1`은 **합성
fixture 설정**이다. 각각 [0,1] 비율, nonnegative safe integer, 0 또는 1이어야 한다.
retry_count는 필수이며 config 한도 이하다. flips equality는 이 kernel에서 hold (`>=`)다.

health JSON:

```json
{"valid_rows":2,"expected_rows":2,"previous_week_flips":0,"quarantine":[]}
```

expected_rows는 positive integer, valid_rows는 0..expected_rows, flips는 nonnegative integer,
quarantine은 nonempty id 문자열의 배열. coverage는 valid/expected로 재계산한다. 실제 core 행을
재세거나 denominator legitimacy를 검증하지 않으므로 원래 집계의 진실성은 별도 검수한다.
valid_rows=0은 양 모드 모두 blocked. weekly에서 coverage<min 또는 flips>=max이면 hold를
요구한다. backfill은 이 두 weekly threshold만 제외하며 null/schema/empty/hash/권한을 면제하지 않는다.

signals JSON:

```json
{"items":[{"id":"candidate-1","status":"candidate","censored":true,"reason":"follow-up window not complete"}]}
```

id는 고유, status는 candidate만, censored는 boolean. true이면 nonempty reason이 필요하다.
실제 관측 window가 censored인지, 수치/가설의 validity는 이 schema checker가 판단하지 않는다.

render는 UTF-8 파일에서 markup의 `data-mi-slot="bluf"`, `wave`, `insight`를 찾고
`MI_PLACEHOLDER`를 거부한다. comments/JS/CSS/raw-text의 문자열은 슬롯으로 계산하지 않는다.
실제 화면/visibility/수치·문장·source 관계 검수는 별도다.

hold inbox는 1개 nonempty UTF-8 artifact이고 첫 줄은 `MI_PARTIAL_ALERT`다. 이것은 부분 결과·원인·
다음 행동 본문을 사람이 확인할 필요가 있는 **구조적 marker**다. 정상 inbox 생성도 외부 전달·
사용자 읽음·인간 결정을 인증하지 않는다.

raw/collect/core/mart는 bytes·nonempty·lineage를 검사하고 실제 domain JSON/schema/grain·
metric truth를 재계산하지 않는다. 전체 production contract와 이 최소 audit adapter를 혼동하지 않는다.

## Resume plan

`plan`의 action은 `no_op`, `external_collect_fresh_needed`, `deterministic_downstream_eligible`,
`human_review_required`, `retry_limit_reached`, `blocked`. 모든 node는 `execution: not_performed`.
eligible도 실행 권한이나 승인 증거가 아니다. collector 권한/예산을 복구하거나 사람이 hold를
검토해야 할 수도 있다. 실제 command는 원본 checkout에서 확인하고 별도 승인 뒤에만 실행한다.

## File safety and tests

- root, parent directories, leaf symlink 차단; relative paths only. `..`, absolute/UNC/drive paths,
  unsafe Windows component names, duplicate/shared artifact paths를 거부한다.
- file당 5MiB, read 최대 1,000개; regular files만 허용. JSON은 strict UTF-8.
- 읽는 동안 inode/device/size/mtime/ctime 변화 검사. 동시 악의적 filesystem 변경에 대한 OS sandbox
  보장이나 multi-file transactional snapshot은 아니다. 검사 대상은 안정된 snapshot으로 제공한다.
- tests는 OS scratch에 fixture를 복사·변형한다. source fixture의 bytes/mtime/ctime/mode 무변경을 검사한다.
- regression coverage: pass/no-op, stale transitivity, output/source tamper, empty/malformed schema,
  hold/skip/partial inbox, backfill, retry, since, real ISO weeks, path/symlink, slots/placeholder.
- 행동 evals는 `evals/evals.json`의 프롬프트/판정 기준이다. 파일이 있다는 것과 실제 모델을
  평가해 통과했다는 것은 다르다.
