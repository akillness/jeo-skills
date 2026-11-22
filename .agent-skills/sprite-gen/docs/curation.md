# Curation — webview, standalone view, finished-sheet editing, `curation.json` — sprite-gen reference

> Owns: The webview, standalone candidate view, finished-sheet editing and every `curation.json` field · Index: [docs/README.md](README.md)

> 큐레이션뷰의 실행과 데이터 계약. 생성 완료 후 열기 선택과 저장된 기본값은 [user-workflow](user-workflow.md)가 소유한다.

## Standalone Curation View (이미지 후보 큐레이션 — 스프라이트 아님)

"큐레이션(뷰) 해줘 / 이미지 후보 보여줘 / 나란히 비교 / 골라볼게" 로 진입했고 대상이 **애니메이션 프레임이
아니라 임의 이미지 후보군**(아이콘 시안, 로고, 생성 초안)이면, 파이프라인 없이 이 단독 경로만 쓴다.
에이전트 채팅 surface 는 이미지를 못 보여주는 경우가 많다 — 이 웹뷰가 그 표시 수단이다.

```bash
export SPRITE_GEN_ROOT=/path/to/sprite-gen
SG=$SPRITE_GEN_ROOT
STAGE=$(mktemp -d); mkdir -p "$STAGE/pngs"
cp <후보들> "$STAGE/pngs/"   # 의미 있는 이름으로: 1-hub-cube.png, 2-hook-plug.png ... (timestamp/uuid 파일명 금지)
# 성격이 다른 이미지를 한 통에 붓지 마라 — 하위폴더 = 큐레이터 줄(state) 하나.
# 예: pngs/portraits/ (표정 세트 줄) + pngs/idle/ (idle 줄).
# 셀 크기는 전 그룹 공유 최대치이므로, 거대한 레퍼런스는 미리 다른 후보 크기대로 축소해 넣는다.
# 소스 1급 수용(run-contract.md §4): pngs/_base/<img> → 베이스 참조 줄, pngs/<group>/_refs/<role>-<name>.png
#   (role=anchor|basis|guide) → 그 줄의 생성 재료 칩. _base·_refs 는 예약 폴더라 큐레이터 줄이 되지 않는다.
"$SG/.venv/bin/python" "$SG/scripts/unpack_atlas_run.py" --pngs-dir "$STAGE/pngs" --out-dir "$STAGE/run" --force
nohup "$SG/.venv/bin/sprite-gen" curation --run-dir "$STAGE/run" --lang ko > "$STAGE/server.log" 2>&1 &
sleep 2
PORT=$(lsof -nP -a -p $! -iTCP -sTCP:LISTEN | awk 'END{sub(".*:","",$9); print $9}')   # stdout 버퍼링 때문에 log 대신 lsof 로 포트 확보
curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/"   # 200 = positive proof, 그 후 URL 보고
```

- **캐릭터/스프라이트 세트 표시 기본지침 = "실제 사용하는 컷"**. 줄(state)은 `base`, `anchor-idle-down`, `idle`, `walk` … 처럼 개념 단위로 만들고, 각 줄의
  내용은 그 개념의 **실물**이다: base·방향 앵커처럼 실물이 1장이면 그 1장, 런타임 상태면 매니페스트가
  실제 재생하는 프레임들을 재생 순서대로 **전부**. 임의 대표컷 발췌(예: `frame-0` 한 장만) 금지 —
  게임이 행 전체를 돌리는데 한 장만 보여주면 검수 대상이 왜곡된다. 아틀라스 시트 통짜·raw
  멀티프레임 row 이미지·비교용 합성 시트를 그대로 붓는 것도 금지 (셀 크기 폭발 + 선택 단위 흐림).
- 선택 회수는 `"$STAGE/run/curation.json"` 의 `selected` 인덱스를 파일명으로 역매핑. 비어 있으면 다시 묻는다 — 추측 진행 금지.
- 큐레이션을 열기로 선택했다면 이미지가 한 장이어도 이 뷰에서 확인할 수 있다. 필요한 편집 결과를 내보낸 뒤 이 작업이 시작한 서버를 종료하고 임시 `$STAGE`를 정리한다.

## Curation Webview

**캐릭터/스프라이트 검수의 정식 뷰 = run dir 를 직접 서빙하는 이 파이프라인 뷰다**.
이 뷰의 네 표시 요소(베이스 참조 줄 · 생성 재료 ref 칩 · 픽셀 격자 · 원본 화질 토글)와 그것을
채우는 `/api/run` payload 는 [`run-contract.md`](run-contract.md) §3 이 계약으로 소유한다 — 어떤
에이전트가 뷰를 차려도 같은 경험이 나오도록 스크립트가 강제한다. 아래는 그 뷰의 상호작용(선택/재배열/
변형)과 시나리오다.

```bash
$SPRITE_GEN_ROOT/.venv/bin/sprite-gen curation \
  --run-dir <target>/assets/generated/sprites/<character-id>
```

This launches a standalone local webview (no orchestrator dependency — usable from Claude Code Desktop, the Codex app, or any host with the skill installed). It shows every state's frames side by side so you can compare them in parallel. Two rows per state: a **sequence** row (the selected play order, saved to `curation.json.selected`, baked left-to-right by compose) and a **candidate pool** row below it (unselected frames, e.g. an extra generated take). A per-frame transform corrects an off angle/position. A live preview animates the selected frames at the state fps, with play/pause, frame stepping, and a 0.25×–4× speed control.

### Colourway (recolor) compare and pick

When the run has a bake under `variants/` (`recolor.report.json` present), the view
adds a colourway section above the state rows (`curator/src/recolor.js`).

Bake the colourways first with `sprite-gen recolor` — command, spec, and report
schema: [`recolor.md`](recolor.md).

The webview UI is bilingual (English / Korean). Pass `--lang en|ko` to match the user's language (it is also toggleable in the app); default is `en`. For isometric sets imported with `--pngs-dir`, a sibling `meta.json` tile/anchor adds a ground-grid overlay for aligning furniture with the shear handle.

A video-loop `cycle/` imported with `--pngs-dir` labels each card of a cell the held fill made `(made)` and of a cell still showing the picture before it `(held)` ([loop-repair](loop-repair.md#7-held-cells-a-picture-shown-again-and-a-cut-at-a-higher-rate)).

## Editing a finished sprite sheet (no `frames/` source)

When only the combined sheet survives (a deployed asset whose run dir is gone), rebuild a curator-ready run dir with the inverse step before curating:

```bash
# default: auto-detect the grid by reading the atlas alpha
$SPRITE_GEN_ROOT/.venv/bin/python $SPRITE_GEN_ROOT/scripts/unpack_atlas_run.py \
  --atlas <sheet>.png --out-dir <run-dir> --force

# when a manifest carries exact rectangles (position-faithful)
.venv/bin/python .../unpack_atlas_run.py --manifest <manifest>.json [--direction <dir>] --out-dir <run-dir>

# when a human states the grid, e.g. "8x9"
.venv/bin/python .../unpack_atlas_run.py --atlas <sheet>.png --grid 8x9 --out-dir <run-dir>
```

The chosen layout source is always reported (`manifest` / `grid-explicit` / `auto-detect`) and stored in `unpack-source.json` for a later writeback. Then point `sprite-gen curation` at the new run dir. Auto-detect is the no-instruction default; `--grid` and `--manifest` are position-faithful (they crop full cells), while auto-detect crops each blob's content bbox and centers it in the cell.

## Multi-agent rules for the auto-launch

- The server picks a free port per launch (`--port 0` default) and serves exactly one run dir, so several agents curating different characters can each keep a webview open with no port or state conflicts.
- One curator webview per run dir. Two webviews on the same run dir are last-write-wins on `curation.json`; if one is already serving that run dir, reuse its URL instead of launching another.
- Pipeline writes are guarded by a run-dir lock (`.sprite-gen.lock`): extract/compose/export/unpack fail loudly when another sprite-gen process is writing the same run dir. Treat that error as "wait or pick another run dir", not as a retry-until-success loop.
- In a headless/remote session add `--no-open` and give the user the URL; on the user's own machine the default auto-opens their browser.

## Curation Sidecar (`curation.json`)

`curation.json` is an optional, non-destructive sidecar written by the curation webview (`sprite_gen/serve/serve_curation.py`) and consumed by `compose_sprite_atlas.py` and `compose_selected_cycle.py`. It records a human selection plus a per-frame affine transform; the original frame PNGs are never modified.

```json
{
  "version": 1,
  "kind": "sprite-gen-curation",
  "run_revision": "9f3c1a0b7e2d4c58",
  "pixel_unfake": true,
  "anchors": { "down": { "state": "down_idle", "index": 2 } },
  "recolor": { "picked": "moss" },
  "states": {
    "idle": {
      "revision": ["a1b2c3d4e5f6"],
      "pixel_unfake": false,
      "selected": [0, 2, 3, 7],
      "order": [0, 2, 3, 7, 1],
      "clones": { "7": 0 },
      "transforms": {
        "0": { "rotate": 15, "scale": 1.2, "dx": 10, "dy": -8, "flipX": 0 }
      }
    }
  }
}
```

- `run_revision` — top-level, **required**; stamped at write: the frame generation (request +
  frames-manifest + each frame's name/size/mtime) this curation was made for. When it matches
  the current run, the whole sidecar applies (fast path). The `POST /api/curation` autosave
  echoes it as `runRevision` and the server rejects a mismatched write (`HTTP 409`). See
  [`run-contract.md`](run-contract.md) §4.
- `states.<state>.revision` — 행 단위 세대 스탬프 (`curation.state_revision`): 그 행의 프레임
  인덱스 공간을 만드는 **원료** 세그먼트(primary raw + 선언 순서의 take raw; raw 없는 임포트
  행은 프레임 파일 내용) 다이제스트의 순서 리스트. frames/ 캐시의 mtime 과 엔진 리비전은
  입력이 아니다.
- `clones` — 프레임 복제 인스턴스 맵 `{복제 인덱스: 원본 프레임 인덱스}` (웹뷰 카드의 ⧉
  버튼). 복제 인덱스는 물리 범위(0..N-1) 밖의 정수이고 `selected`/`order`/`transforms`/
  `pixels` 에 자기 인덱스로 참여하는 정식 인스턴스다 — 자기만의 변형/픽셀편집/순서를 갖고,
  compose/export/GIF 는 파일만 원본 프레임(`source_frame_index`)에서 읽는다. `frames/` 는
  파생 캐시이므로 복제 파일을 만들지 않는다(복제 의도는 사이드카 소유). 웹뷰에서 복제
  카드의 보관 버튼은 보관함이 아니라 인스턴스 삭제다.
- `pixel_unfake` — **두 층위**. top-level = 런 전체 기본값(웹뷰 우측 상단 "전체 토글" — 모든 줄을 한번에 설정; 줄별 값이 섞이면 웹뷰는 이 필드를 생략한다). `states.<state>.pixel_unfake` = 줄별 override(각 줄 헤더의 토글). 해석 순서는 `curation.frame_variant(curation, state)` 가 SSoT: 줄별 값 > top-level > 기본 `true`. `false` 인 줄은 compose/export/GIF 가 적용 전 쌍둥이(`frame-N.plain.png`)를 굽고, 없거나 `true` 인 줄은 canonical `frame-N.png`. plain 쌍둥이가 없는 런에서는 **굽기에** 무의미(플래그와 무관하게 canonical 을 굽는다). manifest 는 줄별 `animation.rows.<state>.frame_variant` 와 top-level 요약(`pixel`/`plain`/`mixed`)을 기록한다. 상세는 [`pixel-unfake.md`](pixel-unfake.md).
- `anchors` — 방향 앵커 **프레임 지정** `{<direction>: {state, index}}`. 그
  방향의 다른 행을 생성할 때 identity 로 붙는 인스턴스 하나다 — 카드의 앵커(핀) 버튼(또는
  `sprite-gen anchor --pick <state>#<index>`)이 쓰고, 지정이 없는 방향은 **앵커 행
  (`<dir>_<anchor_suffix>`)의 시퀀스 첫 인스턴스**가 앵커다(index 0 이 아니다 — 삭제/재정렬을
  존중한다). 같은 방향이면 다른 행의 프레임도, 시퀀스에 없는 후보 풀 프레임도 지정할 수 있다.
  각 지정은 **핀한 행의 `state_revision`** 을 함께 들고(쓰기 시 스탬프, 이월 시 재스탬프
  금지) 그 행이 리롤·재추출되면 게이트가 `stale` 표식을 붙인다 — 같은 인덱스가 다른 그림이
  되므로 조용히 따라가지 않고, 지정을 지워 기본값으로 되돌리지도 않는다. 그 상태의 생성은
  `pick-stale-generation` 으로 fail-loud 하고 뷰가 이유를 띄운다(재지정 한 번으로 풀린다).
  전 행이 드롭돼도 지정은 남는다 — 남아 있어야 오류를 낼 수 있다.
  해석·베이크 SSoT 는 `sprite_gen/curate/anchor.py`.
- `recolor` — optional adopted colourway `{ "picked": "<variant-name>" }`. Written by the
  curation view's colourway Adopt button after `sprite-gen recolor` has baked sheets into
  `<run-dir>/variants/`. Reader: `curation.recolor_pick()`. Full bake + view contract:
  [`recolor.md`](recolor.md).
- `selected` — 0-based frame indices in play order. Absent/empty → all extracted frames in order.
- `order` — optional, webview-owned: the full display order (sequence row then candidate-pool row) so reopening the curator restores the exact arrangement of both rows. `compose` / `state_plan` ignore it and key off `selected`.
- `transforms` — keyed by 0-based frame index. `rotate` degrees (counter-clockwise positive, PIL convention), `scale` multiplier about center, `dx`/`dy` pixel offsets in the cell (+x right, +y down), `shx`/`shy` shear, `flipX` (0|1) horizontal mirror. Absent → identity.
- A state missing from the sidecar uses the all-frames identity default.
- The transform is applied at compose time inside the request-sized cell, so atlas geometry never changes. `manifest.json.animation.rows.<state>.frames` reflects the curated frame count, and `manifest.json.curation_applied` records whether a sidecar was used.

`curation.py` owns this schema and the transform math so the server and the compose scripts cannot drift. If a folder exists from a previous run, create a timestamped sibling unless the user explicitly says to replace it.

## Related

- [`user-workflow.md`](user-workflow.md) - request choices, optional curation and saved defaults
- [`atlas-workflow.md`](atlas-workflow.md) - row execution and delivery
- [`architecture.md`](architecture.md) — 큐레이션 사이드카가 파이프라인에서 소비되는 위치
- [`recolor.md`](recolor.md) — palette-swap bake CLI, report schema, colourway adopt
- [`locomotion-curation.md`](locomotion-curation.md) — 수동 selected-cycle, 클린 GIF export
- [`pixel-unfake.md`](pixel-unfake.md) — 전/후 쌍둥이 토글과 `pixel_unfake` 굽기 결정


## Base editing (same component as frames)

The base reference row's edit button opens the **same zoom modal** used for frame
editing. What differs is only the target:

- Edits/transforms accumulate client-side and bake into `base-source` only via the
  explicit **save-to-base** button.
  The original is backed up once as `.orig`. Nothing about the base ever enters
  `curation.json` (the `__base__` virtual state is excluded from the payload).
- Base edits affect FUTURE generation (anchors/rerolls) — already-extracted frames
  derive from raw strips and do not change.
