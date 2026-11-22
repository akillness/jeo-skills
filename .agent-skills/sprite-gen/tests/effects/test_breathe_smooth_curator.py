# SPDX-License-Identifier: Apache-2.0
"""큐레이터가 smooth 줄을 조용히 pixel 로 그리거나 지우지 않는지.

큐레이터 미러(`breathe.js`)는 pixel 워프만 바이트 동일하게 따라 그린다. smooth 는 쌍선형
사잇값이라 브라우저와 파이썬의 부동소수 연산이 같은 바이트를 낸다고 보장할 수 없어
미러를 두지 않는다. 그러면 지켜야 할 것은 둘이다:
  1. smooth 줄의 미리보기·영상 내보내기는 pixel 로 그리지 않고 **소리 내 거부**한다
  2. 사이드카를 읽고 되쓰는 왕복이 `mode` 를 지우거나 pixel 기본값(depth 0.06, lag 0.1)을
     채워 넣지 않는다 — 그러면 첫 autosave 가 smooth 줄을 조용히 pixel 줄로 바꾼다
"""

import json
import shutil
import subprocess

import pytest

from sprite_gen.curate.curation import state_breathe
from sprite_gen.effects.breathe import freeze_anatomy

from tests.effects.test_breathe import _key
from tests.effects.test_breathe_js_mirror import CURATOR_BREATHE, HARNESS, _rgba
from tests.effects.test_breathe_sidecar_roundtrip import _roundtrip
from tests.effects.test_breathe_smooth import _bust

node = pytest.mark.skipif(shutil.which("node") is None, reason="node 가 없어 큐레이터 JS 를 실행할 수 없다")


def _run(sidecar: dict) -> dict:
    return {"schemaVersion": 1, "fps": 24,
            "states": [{"name": "idle", "fps": 24,
                        "frames": [{"index": 0, "present": True}, {"index": 1, "present": True}]}],
            "curation": {"states": {"idle": {"selected": [0, 1], "breathe": sidecar}}}}


@node
def test_the_mirror_refuses_a_smooth_row_instead_of_drawing_pixel(tmp_path) -> None:
    src = _bust()
    cfg = {"mode": "smooth", "depth": 0.025, "breaths": 2}
    cfg["anatomy"] = freeze_anatomy(src, cfg, _key())
    payload = {
        "script": str(CURATOR_BREATHE), "width": src.width, "height": src.height, "cfg": cfg,
        "cases": [{"phase": 0.4, "rgba": _rgba(src)}],
        "out": str(tmp_path / "js.json"),
    }
    (tmp_path / "payload.json").write_text(json.dumps(payload), encoding="utf-8")
    (tmp_path / "harness.cjs").write_text(HARNESS, encoding="utf-8")
    proc = subprocess.run([shutil.which("node"), str(tmp_path / "harness.cjs"),
                           str(tmp_path / "payload.json")], capture_output=True, text=True)
    assert proc.returncode == 0, f"node 하네스 실패:\n{proc.stderr}"
    got = json.loads((tmp_path / "js.json").read_text(encoding="utf-8"))[0]
    assert not got["ok"] and got["refused"], f"smooth 줄을 미러가 그렸다(pixel 워프로): {got}"
    assert "smooth" in got["message"]


@node
@pytest.mark.parametrize("sidecar", [
    {"mode": "smooth", "depth": 0.02, "breaths": 2},
    {"mode": "smooth", "breaths": 2},                       # depth 생략 = smooth 기본값
    {"mode": "smooth", "depth": 0.02, "depth_x": 0.01, "breaths": 3, "rigid_row": 40},
    {"mode": "smooth", "breaths": 2, "chest_y": 0.4, "chest_rx": 0.9, "chest_ry": 0.3,
     "shoulder": 0.6, "shoulder_lag": 0.1, "chest_tilt": -20, "chest_bias": -0.4, "chest_dir": -30,
     "chest_x": -0.1, "chest_bias_y": 0.3, "chest_flat": 0.25, "inhale": 0.45},
    {"mode": "smooth", "breath_peaks": [21, 69, 118]},
    {"mode": "smooth", "breaths": 2, "loop_cells": 96, "start_cell": 31},
    {"mode": "smooth", "breaths": 2, "loop_cells": None, "start_cell": 5},
], ids=["smooth", "depth-omitted", "with-overrides", "with-shape", "with-peaks", "with-stretch", "turned-own-loop"])
def test_the_round_trip_keeps_a_smooth_sidecar_as_written(tmp_path, sidecar) -> None:
    got = _roundtrip(_run(sidecar), tmp_path)
    saved = got["payload"]["states"]["idle"].get("breathe")
    assert saved == sidecar, f"왕복이 smooth 사이드카를 바꿨다\n  전={sidecar}\n  후={saved}"
    assert state_breathe({"states": {"idle": {"breathe": saved}}}, "idle") == \
        state_breathe({"states": {"idle": {"breathe": sidecar}}}, "idle")
    assert not [m for kind, m in got["status"] if kind == "err"]


@node
@pytest.mark.parametrize("sidecar", [
    {"mode": "soft", "depth": 0.02, "breaths": 2},
    {"mode": "smooth", "depth": 0.02, "breaths": 2, "lag": 0.1},
    {"depth": 0.06, "breaths": 2, "chest_y": 0.3},
    {"mode": "smooth", "breaths": 2, "shoulder_lag": 0.5},
    {"mode": "smooth", "breaths": 2, "chest_dir": -120},
    {"depth": 0.06, "breaths": 2, "chest_tilt": 10},
    {"depth": 0.06, "breath_peaks": [5, 15]},
    {"mode": "smooth", "breath_peaks": [15, 5]},
    {"depth": 0.06, "breaths": 2, "start_cell": 3},
    {"depth": 0.06, "breaths": 2, "loop_cells": None},
    {"mode": "smooth", "breaths": 2, "loop_cells": 24, "start_cell": 24},
    {"mode": "smooth", "breaths": 2, "loop_cells": 1},
    {"mode": "smooth", "breaths": 2, "start_cell": 2.5},
], ids=["unknown-mode", "smooth-with-lag", "shape-on-pixel", "shape-out-of-range", "dir-out-of-range",
        "tilt-on-pixel", "peaks-on-pixel", "peaks-unsorted", "start-on-pixel", "loop-on-pixel", "start-past-loop",
        "one-cell-loop", "start-not-int"])
def test_a_sidecar_the_bake_refuses_is_kept_and_reported(tmp_path, sidecar) -> None:
    with pytest.raises(SystemExit):
        state_breathe({"states": {"idle": {"breathe": sidecar}}}, "idle")
    got = _roundtrip(_run(sidecar), tmp_path)
    saved = got["payload"]["states"]["idle"].get("breathe")
    assert saved == sidecar, f"굽기가 거부하는 사이드카를 왕복이 고쳐 썼다: {saved}"
    assert [m for kind, m in got["status"] if kind == "err"], "거부할 사이드카인데 알림이 없다"


def test_the_mirrored_modes_are_the_same_list() -> None:
    """큐레이터가 아는 mode 목록이 굽기와 같아야 한다 — 갈리면 굽기가 받는 줄을 웹뷰가
    '읽을 수 없는 사이드카'로 들고 있거나, 굽기가 거부하는 줄을 웹뷰가 받아 되쓴다."""
    import re

    from sprite_gen.curate import curation as C
    from sprite_gen.serve.serve_curation import CURATOR_DIR

    js = (CURATOR_DIR / "src" / "breathe.js").read_text(encoding="utf-8")
    m = re.search(r"const BREATHE_MODES = \[(.*?)\];", js)
    assert m, "BREATHE_MODES 가 미러에 없다"
    assert [k.strip().strip('"') for k in m.group(1).split(",")] == list(C.BREATHE_MODES)


def test_the_mirrored_shape_ranges_are_the_same_numbers() -> None:
    import re

    from sprite_gen.curate import curation as C
    from sprite_gen.serve.serve_curation import CURATOR_DIR

    js = (CURATOR_DIR / "src" / "store.js").read_text(encoding="utf-8")
    m = re.search(r"const BREATHE_SMOOTH_SHAPE_RANGES = (\{.*?\});", js)
    assert m, "BREATHE_SMOOTH_SHAPE_RANGES 가 미러에 없다"
    mirrored = json.loads(re.sub(r"(\w+):", r'"\1":', m.group(1)))
    assert {k: tuple(v) for k, v in mirrored.items()} == C.BREATHE_SMOOTH_SHAPE_RANGES
