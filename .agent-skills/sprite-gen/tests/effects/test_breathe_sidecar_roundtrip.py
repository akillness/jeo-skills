# SPDX-License-Identifier: Apache-2.0
"""폐기된 호흡 사이드카가 큐레이터 왕복에서 살아남는지 + JS 위상식이 파이썬과 같은지.

굽기 경로만 `splits`/`amplitude`/`subpixel`/`hold` 를 loud reject 하면 계약이 반쪽이다.
구 런을 큐레이터로 한 번 여는 것만으로 폐기 키가 사이드카에서 사라지면 (a) 사용자는
호흡 설정이 있었다는 사실도 못 듣고 (b) `migrate-breathe` 가 옮길 근거가 파괴되고
(c) 그 뒤 굽기는 "호흡 없음" 으로 조용히 성공한다. 합성 회귀가 이 경로를 고정한다.

위상식은 별개 건이다. round-2 가 파이썬에서 `((i*breaths) % seq) / seq` 로 고쳤는데
미러가 옛 식으로 남아 프리뷰와 굽기가 반올림 경계에서 갈렸다 (합성 경계: seq=30
breaths=7 slot 24 → 4바이트 차이). 기존 미러 테스트는 위상을 파이썬에서 만들어
양쪽에 먹여주기 때문에 `breathePattern` 을 한 번도 안 태운다 — 그래서 못 잡았다.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from sprite_gen.effects.breathe import fit_breathe_pattern  # noqa: E402
from sprite_gen.curate.curation import CURATION_KIND, state_breathe  # noqa: E402
from sprite_gen.serve.serve_curation import CURATOR_DIR  # noqa: E402

CURATOR = CURATOR_DIR / "src"
node = pytest.mark.skipif(shutil.which("node") is None, reason="node 가 없어 큐레이터 JS 를 실행할 수 없다")

HARNESS = r"""
const fs = require("fs"), vm = require("vm");
const P = process.argv[2] + "/";
// breathe.js 는 store.js 가 읽기 검사에 쓰는 최소·최대 키 목록·상한을 정의한다 (브라우저에서도 같이 실린다).
const SOURCES = ["util.js", "store.js", "persistence.js", "breathe.js"].map((f) => fs.readFileSync(P + f, "utf8"));

// 왕복 하나 = 새 vm 컨텍스트 하나. 여러 왕복을 node 한 프로세스에 묶어도
// `run`·`entries`·상태 알림이 다음 왕복으로 새지 않는다.
function boot() {
  const sb = { console, document: { createElement: () => ({ getContext: () => ({}) }) },
    window: {}, __status: [], setStatus: (m, k) => sb.__status.push([k || "", String(m)]),
    t: () => "", fetch: () => {}, alert: () => {}, lang: "ko", STR: { ko: {} },
    entries: {}, anchorPicks: {}, previews: {} };
  sb.globalThis = sb; vm.createContext(sb);
  for (const src of SOURCES) {
    try { vm.runInContext(src, sb); } catch (e) {}
  }
  return sb;
}

const input = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
if (input.mode === "roundtrip") {
  // 한 왕복이 터져도 나머지 왕복은 돈다 — 실패는 그 자리에 `error` 로 남는다.
  const out = input.runs.map((run) => {
    try {
      const sb = boot();
      vm.runInContext(`run = ${JSON.stringify(run)};`, sb);
      sb.seedEntries();
      return { payload: sb.buildPayload(), status: sb.__status };
    } catch (e) {
      return { error: String((e && e.stack) || e) };
    }
  });
  fs.writeFileSync(input.out, JSON.stringify(out));
} else {
  const sb = boot();
  const out = input.cases.map((c) => sb.breathePattern({ breaths: c.breaths }, c.seq));
  fs.writeFileSync(input.out, JSON.stringify(out));
}
"""


def _run(payload, tmp_path):
    harness = tmp_path / "h.cjs"
    harness.write_text(HARNESS, encoding="utf-8")
    payload["out"] = str(tmp_path / "out.json")
    src = tmp_path / "in.json"
    src.write_text(json.dumps(payload), encoding="utf-8")
    proc = subprocess.run([shutil.which("node"), str(harness), str(CURATOR), str(src)],
                          capture_output=True, encoding="utf-8")
    assert proc.returncode == 0, f"node 하네스 실패:\n{proc.stderr}"
    return json.loads(Path(payload["out"]).read_text(encoding="utf-8"))


def _roundtrips(runs, tmp_path):
    """웹뷰 왕복 여러 개를 node 한 프로세스에서 — 왕복마다 새 vm 컨텍스트.

    결과는 왕복마다 `{"payload", "status"}` 또는 `{"error"}`."""
    return _run({"mode": "roundtrip", "runs": runs}, tmp_path)


def _roundtrip(run, tmp_path):
    [got] = _roundtrips([run], tmp_path)
    assert "error" not in got, f"왕복이 터졌다:\n{got['error']}"
    return got


@node
def test_curator_preserves_a_retired_breathe_sidecar(tmp_path):
    """구 스키마 키가 있는 사이드카를 웹뷰가 읽고 되쓰면 그 키가 그대로 남아야 한다.
    조용히 넘어가지도 않는다 — 마이그레이션 경로를 화면에 알린다.

    폐기 키 하나로 충분하다: 큐레이터는 키 목록 `RETIRED_BREATHE_KEYS.filter` 한 줄로
    거르고, 그 목록이 파이썬과 같은지는
    `test_breathe_reference_key.py::test_the_mirrored_limits_are_the_same_numbers` 가 본다."""
    breathe = {"splits": [0.55], "breaths": 3}
    run = {"schemaVersion": 1, "fps": 6,
           "states": [{"name": "idle", "fps": 6,
                       "frames": [{"index": 0, "present": True}, {"index": 1, "present": True}]}],
           "curation": {"states": {"idle": {"selected": [0, 1], "breathe": breathe}}}}
    got = _roundtrip(run, tmp_path)
    # 저장 payload 의 kind 가 다르면 서버(write_curation_atomic)가 모든 autosave 를 거부한다.
    assert got["payload"]["kind"] == CURATION_KIND, f"buildPayload 의 kind 가 갈렸다: {got['payload']['kind']!r}"
    saved = got["payload"]["states"]["idle"].get("breathe")
    assert saved is not None, "splits: 저장 payload 에서 breathe 가 통째로 사라졌다"
    assert "splits" in saved, "splits: 폐기 키가 삭제됐다 — migrate 근거가 파괴된다"
    assert saved == breathe, "폐기 사이드카는 정규화도 하지 않고 원본 그대로여야 한다"
    # 굽기 쪽 loud reject 가 여전히 걸리는지 (계약이 왕복 후에도 성립)
    with pytest.raises(SystemExit):
        state_breathe({"states": {"idle": {"breathe": saved}}}, "idle")
    errs = [m for kind, m in got["status"] if kind == "err"]
    assert errs, "폐기 스키마를 만났는데 아무 알림도 없다"
    assert any("migrate-breathe" in m for m in errs), f"마이그레이션 경로 안내가 없다: {errs}"


PATTERN_CASES = [(18, 3), (30, 7), (12, 2), (12, 4), (7, 2), (20, 5)]


@node
def test_js_phase_pattern_is_bit_identical_to_python(tmp_path):
    """위상식 미러 — 부동소수 표현까지 같아야 프리뷰가 굽기와 안 갈린다.

    여섯 칸을 node 한 번에 돌린다(하네스가 원래 `cases` 를 받는다). 갈린 칸은
    `seq-breaths` 이름으로 전부 보고한다."""
    got_all = _run({"mode": "pattern",
                    "cases": [{"seq": seq, "breaths": breaths} for seq, breaths in PATTERN_CASES]},
                   tmp_path)
    assert len(got_all) == len(PATTERN_CASES)
    failures = []
    for (seq, breaths), got in zip(PATTERN_CASES, got_all):
        want = fit_breathe_pattern(seq, {"breaths": breaths})
        if len(got) != len(want):
            failures.append(f"[{seq}-{breaths}] 길이가 다르다: py={len(want)} js={len(got)}")
            continue
        failures += [f"[{seq}-{breaths}] slot {i}: py={a!r} js={b!r}"
                     for i, (a, b) in enumerate(zip(want, got)) if a != b]
        if len(set(got)) != len(set(want)):
            failures.append(f"[{seq}-{breaths}] 유니크 위상 개수가 다르다 (표현 노이즈)")
    assert not failures, "위상식 미러가 갈렸다:\n" + "\n".join(failures)


# ── 왕복 계약 전수 매트릭스 ─────────────────────────────────────────
#
# 아홉 라운드 동안 같은 실패 모드가 값 모양만 바꿔 네 번 반복됐다 (round-3 `splits`,
# round-6 `depth:"0.08"`, round-7 `breaths:"3.5"`, round-9 `depth` 생략, round-10 `lag:null`).
# 매번 지적된 한 칸만 메웠기 때문이다. 여기서는 **키 × 값 모양을 전수 열거**해 굽기와
# 큐레이터의 판정이 어긋나는 칸이 하나도 없음을 한 번에 고정한다.

_VALUE_SHAPES = {
    "omitted": None,                 # 키 자체를 안 넣는다
    "null": None,
    "string": None,
    "zero": 0,
    "negative": -1,
    "huge": 999,
    "fractional": 2.5,
    # `Number("")` 과 `Number([])` 는 **0** 이다 — 정수 검사만 하는 미러는 이 둘을 통과시켜
    # 첫 autosave 가 사용자 값을 0 으로 덮었다. 파이썬은 `float("")` 이 터져 거부한다.
    "empty-string": "",
    "empty-list": [],
}


# 매트릭스가 도는 키 = 사이드카 `breathe` 의 **전체 키**. 한때 `depth`·`breaths`·`lag`
# 셋뿐이었고, 그동안 `rigid_row` 는 빈 문자열·빈 리스트를 0 으로 덮으면서 알림도 없었다
# (validator 실측 2026-07-26) — "전수 매트릭스" 가 안 도는 키에 같은 실패 모드가 남아 있었다.
# `anatomy` 는 값 모양 매트릭스에 넣지 않는다: 굽기가 dict 아닌 값을 전부 `None` 으로
# 보므로 `0`/`""`/`[]` 가 서로 **동치**이고, 그 칸들은 통과해도 아무것도 보증하지 못한다.
# 대신 의미 있는 계약(유효한 해부가 왕복에서 그대로 살아남는가)을 아래 전용 테스트로 건다.
MATRIX_KEYS = ["depth", "breaths", "lag", "rigid_row"]
# 세기 대신 가로·세로 최소·최대로 적은 줄 (2026-10-29) — 같은 값 모양 매트릭스를 네 키에 돌린다.
RANGE_KEYS = ["width_min", "width_max", "height_min", "height_max"]
RANGE_ROW = {"width_min": 0.0, "width_max": 0.06, "height_min": -0.05, "height_max": 0.0}


def _sidecar_for(key, shape):
    base = {"depth": 0.06, "breaths": 2, "lag": 0.1, "rigid_row": 12,
            # `anatomy` 는 서버가 써넣는 파생 캐시다. 굽기는 이 값을 안 읽지만(매번 다시
            # 잰다) 큐레이터가 손상된 값을 **조용히 갈아치우면** 안 된다 — 미러가 거부할
            # 근거이자 사용자가 무엇을 들고 있었는지의 증거다.
            "anatomy": {"width": 40, "height": 50, "axis_x": 20, "neck_row": 10,
                        "neck_source": "bottleneck", "rigid_row": 12,
                        "rigid_source": "neck", "basis_row": 12, "torso_half": 9.0,
                        "max_half": 11.0, "face": None, "warnings": [],
                        "fingerprint": "pixel:0:deadbeef"}}
    if key in RANGE_KEYS:
        del base["depth"]
        base.update(RANGE_ROW)
    if shape == "omitted":
        base.pop(key)
    elif shape == "null":
        base[key] = None
    elif shape == "string":
        base[key] = "0.08" if key in ("depth", "lag") else "0.03" if key in RANGE_KEYS else "3"
    elif shape in ("empty-string", "empty-list"):
        base[key] = "" if shape == "empty-string" else []
    else:
        base[key] = _VALUE_SHAPES[shape]
    return base


def _bake_verdict(sidecar):
    """굽기의 판정 — (수용?, 정규화 결과)."""
    try:
        return True, state_breathe({"states": {"idle": {"breathe": sidecar}}}, "idle")
    except SystemExit:
        return False, None


def _matrix_run(sidecar):
    return {"schemaVersion": 1, "fps": 6,
            "states": [{"name": "idle", "fps": 6,
                        "frames": [{"index": 0, "present": True}, {"index": 1, "present": True}]}],
            "curation": {"states": {"idle": {"selected": [0, 1], "breathe": sidecar}}}}


def _check_matrix_cell(key, shape, sidecar, got):
    """매트릭스 한 칸의 판정 — 어긋나면 `AssertionError` 로 그 칸의 사유를 말한다."""
    assert "error" not in got, f"{key}={shape}: 왕복이 터졌다\n{got.get('error')}"
    accepted, before = _bake_verdict(sidecar)
    saved = got["payload"]["states"]["idle"].get("breathe")
    errs = [m for kind, m in got["status"] if kind == "err"]

    if not accepted:
        assert saved == sidecar, (
            f"{key}={shape}: 굽기가 거부하는 사이드카를 큐레이터가 바꿔 썼다 — "
            f"거부 근거가 사라진다\n  원본={sidecar}\n  저장={saved}")
        assert errs, f"{key}={shape}: 굽기가 거부하는데 화면 알림이 없다"
        after_accepted, _ = _bake_verdict(saved)
        assert not after_accepted, f"{key}={shape}: 왕복이 거부를 통과로 바꿨다"
    else:
        assert saved is not None, f"{key}={shape}: 굽기가 받는 설정을 큐레이터가 지웠다"
        after_accepted, after = _bake_verdict(saved)
        assert after_accepted, (
            f"{key}={shape}: 왕복이 굽기가 죽는 사이드카를 만들었다\n"
            f"  원본={sidecar}\n  저장={saved}")
        assert after == before, (
            f"{key}={shape}: 왕복이 굽기가 쓰는 값을 바꿨다\n  전={before}\n  후={after}")


@node
def test_the_curator_agrees_with_the_bake_on_every_value_shape(tmp_path):
    """굽기가 거부하는 사이드카는 큐레이터도 **원본 그대로 두고 알린다**.
    굽기가 받는 사이드카는 큐레이터도 받고, 왕복해도 굽기가 쓰는 값이 안 바뀐다.

    어느 쪽이든 **첫 autosave 가 사용자의 원래 숫자를 바꾸면 안 된다** — 그게 이
    플랜에서 네 번 반복된 실패 모드다(굽기가 거부하던 근거가 조용히 사라진다).
    범위 밖 값 깎기(`huge`/`zero`), 숫자 문자열 수용(`depth-string`), `depth`·`lag`
    생략(`*-omitted`)도 이 표의 칸이다.

    키 × 값 모양 36칸은 node 한 프로세스에서 돈다 — 칸마다 새 vm 컨텍스트라 칸끼리
    상태가 안 샌다. 칸은 하나도 줄이지 않고, 갈린 칸은 제 이름(`key-shape`)으로
    전부 보고한다."""
    cells = [(key, shape, _sidecar_for(key, shape))
             for key in MATRIX_KEYS + RANGE_KEYS for shape in sorted(_VALUE_SHAPES)]
    results = _roundtrips([_matrix_run(sidecar) for _, _, sidecar in cells], tmp_path)
    assert len(results) == len(cells)

    failures = []
    for (key, shape, sidecar), got in zip(cells, results):
        try:
            _check_matrix_cell(key, shape, sidecar, got)
        except Exception as exc:          # 한 칸의 실패가 나머지 칸을 가리면 안 된다
            failures.append(f"[{key}-{shape}] {type(exc).__name__}: {exc}")
    assert not failures, (
        f"매트릭스 {len(cells)}칸 중 {len(failures)}칸이 갈렸다:\n" + "\n\n".join(failures))


@node
def test_a_valid_anatomy_survives_the_round_trip_verbatim(tmp_path):
    """서버가 얼린 해부는 왕복에서 **한 글자도** 안 바뀐다.

    특히 `fingerprint` 다: 이 값이 왕복에서 사라지거나 바뀌면 미러의 신선도 판정이
    통째로 무력해지고(지문 없음 = 확인 불가 = 거부), 사용자는 호흡 프리뷰가 영구
    거부되는 상태에 빠진다. 값 모양 매트릭스는 이 계약을 못 본다 — 굽기가 dict 아닌
    해부를 전부 `None` 으로 보므로 손상 모양끼리 동치라서다."""
    anatomy = {"width": 40, "height": 50, "axis_x": 20, "neck_row": 10,
               "neck_source": "bottleneck", "rigid_row": 12, "rigid_source": "neck",
               "basis_row": 12, "torso_half": 9.0, "max_half": 11.0,
               "face": None, "warnings": [], "fingerprint": "pixel:0:deadbeef"}
    sidecar = {"depth": 0.06, "breaths": 2, "lag": 0.1, "rigid_row": 12, "anatomy": anatomy}
    run = {"schemaVersion": 1, "fps": 6,
           "states": [{"name": "idle", "fps": 6,
                       "frames": [{"index": 0, "present": True}, {"index": 1, "present": True}]}],
           "curation": {"states": {"idle": {"selected": [0, 1], "breathe": sidecar}}}}
    got = _roundtrip(run, tmp_path)
    saved = got["payload"]["states"]["idle"].get("breathe")
    assert saved.get("anatomy") == anatomy, (
        f"왕복이 해부를 바꿨다 — 신선도 판정의 근거가 사라진다\n"
        f"  전={anatomy}\n  후={saved.get('anatomy')}")


# 최소·최대 줄과 세기 줄의 나머지 칸 — 값 모양 매트릭스가 못 만드는 조합. 앞 셋은 굽기가 받는 줄이라 왕복 뒤에도
# 굽기가 쓰는 값이 같아야 하고(세기 줄의 depth_x·영역 손잡이도 되써야 한다), 뒤는 굽기가 거부하는 줄이라 원본 그대로 두고 알린다.
_RANGE_CELLS = {
    "depth-x-and-band": {"depth": 0.06, "depth_x": 0.12, "breaths": 2, "lag": 0.1, "rigid_row": 12,
                         "axis_x": 20, "torso_half": 6},
    "smooth-range": {"mode": "smooth", "breaths": 2, **RANGE_ROW},
    "range-partial": {"width_max": 0.05, "breaths": 2, "lag": 0.0},
    "range-bool": {**RANGE_ROW, "width_max": True, "breaths": 2},
    "range-flipped": {**RANGE_ROW, "width_min": 0.07, "breaths": 2},
    "range-with-depth": {**RANGE_ROW, "depth": 0.06, "breaths": 2},
    "range-with-depth-x": {**RANGE_ROW, "depth_x": 0.0, "breaths": 2},
    "range-on-round-chest": {"chest_round": 0.05, "breaths": 2, "width_max": 0.05},
}


@node
def test_the_curator_agrees_with_the_bake_on_min_max_rows(tmp_path):
    results = _roundtrips([_matrix_run(sidecar) for sidecar in _RANGE_CELLS.values()], tmp_path)
    failures = []
    for (name, sidecar), got in zip(_RANGE_CELLS.items(), results):
        try:
            _check_matrix_cell(name, "cell", sidecar, got)
        except Exception as exc:
            failures.append(f"[{name}] {type(exc).__name__}: {exc}")
    assert not failures, "\n\n".join(failures)
    accepted = [name for name, sidecar in _RANGE_CELLS.items() if _bake_verdict(sidecar)[0]]
    assert accepted == ["depth-x-and-band", "smooth-range", "range-partial"], accepted
