# SPDX-License-Identifier: Apache-2.0
"""큐레이터가 둥근 가슴 pixel 줄(`chest_round`·`arms_x`)을 조용히 봉투 스쿼시로 그리거나 지우지 않는지.

미러(`breathe.js`)는 봉투 워프만 바이트 같게 따라 그린다. 둥근 가슴 장은 미러가 없으니 smooth 줄처럼:
  1. 미리보기·영상 내보내기는 봉투 워프로 그리지 않고 소리 내 거부한다
  2. 사이드카를 읽고 되쓰는 왕복이 chest_round·arms_x 를 지우거나 pixel 기본값(depth 0.06, lag 0.1)을 채워 넣지 않는다 —
     그러면 첫 autosave 가 둥근 가슴 줄을 조용히 봉투 스쿼시 줄로 바꾼다 (채워 넣은 depth 는 굽기가 거부하기도 한다)
  3. 굽기가 거부하는 둥근 가슴 사이드카는 고쳐 쓰지 않고 그대로 들고 알린다
"""

import json
import re
import shutil
import subprocess

import pytest

from sprite_gen.curate import curation as C
from sprite_gen.curate.curation import state_breathe
from sprite_gen.effects.breathe import freeze_anatomy
from sprite_gen.serve.serve_curation import CURATOR_DIR

from tests.effects.test_breathe import _key
from tests.effects.test_breathe_js_mirror import CURATOR_BREATHE, HARNESS, _rgba
from tests.effects.test_breathe_round import _figure
from tests.effects.test_breathe_sidecar_roundtrip import _roundtrip
from tests.effects.test_breathe_smooth_curator import _run

node = pytest.mark.skipif(shutil.which("node") is None, reason="node 가 없어 큐레이터 JS 를 실행할 수 없다")


@node
@pytest.mark.parametrize("cfg", [{"chest_round": 0.04, "breaths": 2}, {"arms_x": 0.03, "breaths": 1}],
                         ids=["chest-round", "arms-x"])
def test_the_mirror_refuses_a_round_row_instead_of_drawing_the_envelope(tmp_path, cfg) -> None:
    src = _figure()[0]
    cfg = {**cfg, "anatomy": freeze_anatomy(src, cfg, _key())}
    payload = {"script": str(CURATOR_BREATHE), "width": src.width, "height": src.height, "cfg": cfg,
               "cases": [{"phase": 0.4, "rgba": _rgba(src)}], "out": str(tmp_path / "js.json")}
    (tmp_path / "payload.json").write_text(json.dumps(payload), encoding="utf-8")
    (tmp_path / "harness.cjs").write_text(HARNESS, encoding="utf-8")
    proc = subprocess.run([shutil.which("node"), str(tmp_path / "harness.cjs"), str(tmp_path / "payload.json")],
                          capture_output=True, text=True)
    assert proc.returncode == 0, f"node 하네스 실패:\n{proc.stderr}"
    got = json.loads((tmp_path / "js.json").read_text(encoding="utf-8"))[0]
    assert not got["ok"] and got["refused"], f"둥근 가슴 줄을 미러가 봉투 워프로 그렸다: {got}"
    assert "둥근 가슴" in got["message"]


@node
@pytest.mark.parametrize("sidecar", [
    {"chest_round": 0.04, "breaths": 2},
    {"arms_x": 0.03, "breaths": 1, "torso_half": 21},
    {"chest_round": 0.05, "arms_x": 0.02, "breath_peaks": [72, 192], "inhale": 0.6, "chest_y": 0.4,
     "chest_rx": 0.9, "chest_ry": 0.3, "chest_tilt": -10, "chest_bias": 0.2, "chest_x": 0.1, "chest_bias_y": 0.1},
    {"chest_round": 0.04, "breaths": 2, "loop_cells": 96, "start_cell": 31},
    {"mode": "pixel", "chest_round": 0.04, "breaths": 2, "rigid_row": 30},
], ids=["chest-round", "arms-x", "with-shape", "with-stretch", "pixel-written"])
def test_the_round_trip_keeps_a_round_sidecar_as_written(tmp_path, sidecar) -> None:
    got = _roundtrip(_run(sidecar), tmp_path)
    saved = got["payload"]["states"]["idle"].get("breathe")
    assert saved == sidecar, f"왕복이 둥근 가슴 사이드카를 바꿨다\n  전={sidecar}\n  후={saved}"
    assert state_breathe({"states": {"idle": {"breathe": saved}}}, "idle") == \
        state_breathe({"states": {"idle": {"breathe": sidecar}}}, "idle")
    assert not [m for kind, m in got["status"] if kind == "err"]


@node
@pytest.mark.parametrize("sidecar", [
    {"chest_round": 0.3, "breaths": 2},
    {"chest_round": "a", "breaths": 2},
    {"chest_round": 0.04, "depth": 0.06},
    {"chest_round": 0.04, "lag": 0.1},
    {"arms_x": 0.03, "shoulder": 0.5},
    {"chest_round": 0.04, "chest_flat": 0.2},
    {"mode": "smooth", "breaths": 2, "chest_round": 0.04},
    {"chest_round": 0.04, "chest_y": 1.5},
], ids=["out-of-range", "not-a-number", "with-depth", "with-lag", "smooth-shape", "flat", "on-smooth", "shape-range"])
def test_a_round_sidecar_the_bake_refuses_is_kept_and_reported(tmp_path, sidecar) -> None:
    with pytest.raises(SystemExit):
        state_breathe({"states": {"idle": {"breathe": sidecar}}}, "idle")
    got = _roundtrip(_run(sidecar), tmp_path)
    saved = got["payload"]["states"]["idle"].get("breathe")
    assert saved == sidecar, f"굽기가 거부하는 사이드카를 왕복이 고쳐 썼다: {saved}"
    assert [m for kind, m in got["status"] if kind == "err"], "거부할 사이드카인데 알림이 없다"


def test_the_mirrored_round_keys_are_the_same() -> None:
    """큐레이터가 아는 둥근 가슴 키·상한·읽는 모양 값이 굽기와 같아야 한다 — 갈리면 웹뷰가 굽기가 받는 줄을 거부된
    줄로 들고 있거나, 굽기가 거부하는 줄을 받아 되쓴다."""
    js = (CURATOR_DIR / "src" / "store.js").read_text(encoding="utf-8")
    keys = re.search(r"const BREATHE_ROUND_KEYS = \[(.*?)\];", (CURATOR_DIR / "src" / "breathe.js").read_text(encoding="utf-8"))
    top = re.search(r"const BREATHE_ROUND_MAX = ([0-9.]+);", js)
    shape = re.search(r"const BREATHE_ROUND_SHAPE = \[(.*?)\];", js)
    assert keys and top and shape, "둥근 가슴 키가 미러에 없다"
    assert [k.strip().strip('"') for k in keys.group(1).split(",")] == list(C.BREATHE_ROUND_KEYS)
    assert float(top.group(1)) == C.BREATHE_ROUND_MAX
    assert [k.strip().strip('"') for k in shape.group(1).split(",")] == list(C.BREATHE_ROUND_SHAPE)
