# SPDX-License-Identifier: Apache-2.0
"""Breathe 레이어의 smooth 모드 — 큰 일러·영상 프레임용 부드러운 숨쉬기의 계약.

pixel(기본)은 정수 행·열 사상이라 도트 그림의 격자를 지키지만, 큰 일러에서는 머리가
통째로 오르내리고 행 복제가 칸마다 떨림으로 읽힌다. smooth 는 같은 해부(강체 경계·몸통
축·몸통 반폭·정규화 기준)를 쓰되 머리를 **자리와 바이트 그대로** 두고, 가슴 가운데를 중심으로
한 둥근 무게로 가슴이 부풀어 오르게 한다. 어깨는 가슴의 몇 할만, 조금 늦게 따라 오른다 —
가로줄이 통째로 오르내리는 모양이 아니다.

지키는 것 (구현이 아니라 계약):
  1. 위상 0 인 칸은 원본과 바이트 동일 (첫 칸 0 — 루프·묶음 이음이 안 바뀐다, 어깨 지연도)
  2. 강체 경계 위(목·턱 위)는 모든 칸에서 자리·바이트 그대로 — 줄의 기준 칸이 정한 자리
  3. 가슴 가운데가 depth × 정규화 기준 높이만큼 올랐다 돌아온다 — 한 루프에 breaths 회
  4. 가로줄 통째 이동이 아니다: 같은 높이라도 가슴 무게 밖은 덜 오르고, 어깨 끝은 가슴의
     shoulder 배쯤을 늦게 오른다
  5. 머리·몸통 경계에 이음새·찢김이 없다 (색 기울기가 연속, 몸통 안이 끊기지 않는다)
  6. 큰 캔버스(1000px 높이)에서도 같은 계약
  7. 기본(pixel)은 이전과 바이트 동일, mode 를 안 적은 사이드카의 정규화도 그대로
  8. 사이드카 `mode`·`depth`·`breaths` 와 모양 값(chest_*·shoulder*)을 읽고, 모르는 값은 거부
  9. smooth 에 lag(0 아닌 값)는 조용히 버리지 않고 거부한다
 10. 화면 변에 닿은(원래 화면 밖으로 잘린) 그림도 거부하지 않는다 — 가슴 무게가 화면 안에서
     0 으로 떨어져 아무것도 밖으로 밀리지 않는다
"""

from __future__ import annotations

import hashlib
import json

import numpy as np
import pytest
from PIL import Image

from sprite_gen.curate.curation import state_breathe
from sprite_gen.effects import breathe as B
from sprite_gen.effects.anatomy import analyze
from sprite_gen.frames.extract import solid_alpha_bbox

from tests.effects.test_breathe import _dome, _humanoid, _outlined_figure, _winged

INHALE = B.SMOOTH_SHAPE["inhale"]  # 기본 들숨 몫 — 기본 숨이 가득 차는 위상
SKIN = (222, 184, 150, 255)
BODY = (170, 120, 96, 255)
EYE = (24, 18, 22, 255)
MARK = (16, 16, 16, 255)


def _bust(h: int = 120, *, gradient: bool = True, marks: tuple[float, ...] = (),
          margin: float = 0.10, touch_bottom: bool = True) -> Image.Image:
    """머리 + 목 병목 + 화면 아래 변에 닿는 몸통 — 큰 일러 idle 을 줄인 합성 도형.

    `gradient` 면 눈을 뺀 모든 불투명 픽셀의 붉은 채널이 아래로 갈수록 한결같이 오른다
    — 출력의 세로 기울기로 이음새·찢김을 읽는다. `marks` 는 콘텐츠 높이 비율 자리에 그은 1px
    어두운 가로선이다 — 그 무게중심으로 한 행이 얼마나 올랐는지를 소수 px 로 잰다.
    `margin` 은 몸통 옆 여백(캔버스 폭 비율), 0 이면 몸통이 화면 양옆 변에 닿는다."""
    w = int(h * 0.8)
    yy, xx = np.mgrid[0:h, 0:w]
    cx = w / 2.0
    body_bottom = h if touch_bottom else int(h * 0.92)
    head = ((xx + 0.5 - cx) / (h * 0.15)) ** 2 + ((yy + 0.5 - h * 0.25) / (h * 0.17)) ** 2 <= 1.0
    neck = (np.abs(xx + 0.5 - cx) <= h * 0.06) & (yy >= h * 0.38) & (yy < h * 0.48)
    half = cx - margin * w
    body = (np.abs(xx + 0.5 - cx) <= half) & (yy >= h * 0.46) & (yy < body_bottom)
    a = np.zeros((h, w, 4), np.uint8)
    figure = head | neck | body
    if gradient:
        red = (40 + np.round(180.0 * yy / max(1, h - 1))).astype(np.uint8)
        a[figure] = np.stack([red, np.full_like(red, 120), np.full_like(red, 96),
                              np.full_like(red, 255)], axis=-1)[figure]
    else:
        a[head] = SKIN
        a[(neck | body) & ~head] = BODY
    for ex in (cx - h * 0.065, cx + h * 0.065):
        eye = ((xx + 0.5 - ex) / (h * 0.025)) ** 2 + ((yy + 0.5 - h * 0.24) / (h * 0.03)) ** 2 <= 1.0
        a[eye & head] = EYE
    image = Image.fromarray(a, "RGBA")
    top = solid_alpha_bbox(image)[1]
    for frac in marks:
        row = top + int(round(frac))
        a[row, body[row]] = MARK
    return Image.fromarray(a, "RGBA")


def _smooth(**extra) -> dict:
    """smooth 사이드카 — 값이 None 인 키는 적지 않는다 (생략과 같다)."""
    raw = {"mode": "smooth", "depth": 0.025, "breaths": 2, **extra}
    return {k: v for k, v in raw.items() if v is not None}


def _cfg(raw: dict) -> dict:
    """사이드카 값 하나를 굽기와 같은 정규화로 — 굽기가 받는 cfg 그대로."""
    return state_breathe({"states": {"idle": {"breathe": raw}}}, "idle")


def _mark_row(frame: Image.Image, near: float, column: int, reach: int = 4) -> float:
    """`near` 근처 어두운 선의 무게중심 행 (소수) — 한 열 위에서 어두움으로 가중."""
    a = np.asarray(frame.convert("RGBA"), np.float64)
    lo, hi = int(near) - reach, int(near) + reach + 1
    alpha = a[lo:hi, column, 3:4] / 255.0           # 몸통 색 위에 얹어 읽는다 — 투명은 어둡지 않다
    col = (a[lo:hi, column, :3] * alpha + np.array(BODY[:3]) * (1.0 - alpha)).mean(axis=1)
    weight = np.clip(sum(BODY[:3]) / 3.0 - col, 0.0, None)   # 몸통 색 = 0, 표시선 쪽으로 선형
    assert weight.sum() > 0, "표시선을 못 찾았다"
    return float((weight * np.arange(lo, hi)).sum() / weight.sum())


def _phase_frames(src: Image.Image, cfg: dict, count: int):
    frames, phases = B.bake_breathe_sequence([src] * count, cfg)
    return frames, phases


# ── 1. 첫 칸 0 ──────────────────────────────────────────────────────

def test_a_cell_at_phase_zero_is_byte_identical_to_its_source() -> None:
    src = _bust()
    frames, phases = _phase_frames(src, _cfg(_smooth()), 24)
    zero = [i for i, p in enumerate(phases) if p == 0.0]
    assert zero == [0, 12], f"breaths 2 / 24칸이면 위상 0 은 0·12번 칸이다: {zero}"
    for i in zero:
        assert frames[i].tobytes() == src.tobytes(), f"{i}번 칸: 위상 0 인데 원본과 다르다"
    assert any(f.tobytes() != src.tobytes() for f in frames), "숨을 한 번도 안 쉬었다"
    assert B.smooth_wave(0.0, INHALE) == 0.0 and B.smooth_wave(INHALE, INHALE) == 1.0
    for lag in (0.0, 0.08, 0.2):
        assert B.smooth_shoulder_wave(0.0, lag, INHALE) == 0.0, "어깨 지연이 첫 칸을 움직인다"


# ── 2. 머리 자리·바이트 고정 ───────────────────────────────────────

@pytest.mark.slow
@pytest.mark.parametrize("h", [120, 1000], ids=["small", "1000px"])
def test_the_head_stays_in_place_byte_for_byte(h: int) -> None:
    src = _bust(h)
    anat = analyze(src)
    top = solid_alpha_bbox(src)[1]
    cut = top + anat.rigid_row                     # 이 위가 강체(목·턱 위) 구간
    cfg = _cfg(_smooth())
    expect = np.asarray(src)[:cut].tobytes()
    for phase in (0.1, INHALE, 0.55, 0.8):
        got = B.phase_frame(src, cfg, phase, anat)
        assert np.asarray(got)[:cut].tobytes() == expect, \
            f"위상 {phase}: 강체 경계({cut}행) 위가 움직였다 — 목·턱 위는 자리·바이트 그대로여야 한다"
        assert got.tobytes() != src.tobytes(), f"위상 {phase}: 몸통이 안 움직였다"


def test_the_head_line_is_the_reference_cells_for_the_whole_loop() -> None:
    """칸마다 머리 윗선이 흔들려도(머리카락 한 올이 솟는 칸) 경계는 줄의 기준 칸(첫 칸)에서 잰
    자리에 있다 — 해부가 줄 한 벌이듯 그 자리도 한 벌이다. 칸마다 그 칸의 bbox 로 다시 놓으면
    경계 바로 위 행이 칸에 따라 움직인다 (영상 루프는 머리 윗선이 칸마다 한두 px 흔들린다)."""
    base = _bust()
    top = solid_alpha_bbox(base)[1]
    cut = top + analyze(base).rigid_row
    strand = np.asarray(base).copy()
    strand[top - 3:top, base.width // 2] = BODY      # 머리 위로 솟은 한 올 — bbox 윗선이 3px 오른다
    frames = [base, Image.fromarray(strand, "RGBA")] * 6
    baked, _ = B.bake_breathe_sequence(frames, _cfg(_smooth()))
    for i, (src, got) in enumerate(zip(frames, baked)):
        assert np.asarray(got)[:cut].tobytes() == np.asarray(src)[:cut].tobytes(), \
            f"{i}번 칸: 기준 칸의 강체 경계({cut}행) 위가 움직였다"


# ── 3·4. 가슴이 depth 만큼, 어깨는 덜·늦게, 가로줄 통째가 아니다 ───

def _marked(h: int = 120, **raw):
    """가슴 가운데 행과 어깨선 행에 표시선을 그은 흉상과 그 자리 (캔버스 좌표)."""
    cfg = _cfg(_smooth(**raw))
    probe = _bust(h, gradient=False)
    anat = analyze(probe)
    chest_x, chest_y = B.smooth_chest(anat, cfg)
    shoulder = B.smooth_shoulder_row(anat)
    src = _bust(h, gradient=False, marks=(chest_y, shoulder))
    anat = analyze(src)
    box = solid_alpha_bbox(src)
    rows = {"chest": box[1] + int(round(chest_y)), "shoulder": box[1] + int(round(shoulder))}
    cols = {"axis": box[0] + anat.axis_x,
            "tip": box[0] + anat.axis_x + int(B.SHOULDER_X * anat.torso_half),  # 어깨 자리
            "side": box[0] + anat.axis_x - int(0.95 * anat.torso_half)}   # 가슴 무게 밖
    return src, anat, cfg, rows, cols


def _rise(src, got, row, col, reach) -> float:
    return _mark_row(src, row, col, reach) - _mark_row(got, row, col, reach)


@pytest.mark.slow
@pytest.mark.parametrize("h", [120, 1000], ids=["small", "1000px"])
def test_the_chest_rises_by_depth_and_settles_back(h: int) -> None:
    src, anat, cfg, rows, cols = _marked(h)
    lift = cfg["depth"] * anat.basis_rows
    reach = int(lift) + 4
    for phase in (0.0, 0.2, INHALE, 0.7, 0.95):
        got = B.phase_frame(src, cfg, phase, anat)
        rise = _rise(src, got, rows["chest"], cols["axis"], reach)
        want = lift * B.smooth_wave(phase, INHALE)
        assert rise == pytest.approx(want, abs=0.3), \
            f"위상 {phase}: 가슴 가운데가 {rise:.2f}px 올랐다 — {want:.2f}px 여야 한다 (depth {cfg['depth']} × 기준 {anat.basis_rows}행)"


@pytest.mark.parametrize("h", [120, 1000], ids=["small", "1000px"])
def test_it_is_not_a_whole_row_moving_up(h: int) -> None:
    """가슴 무게는 둥글다 — 같은 행이라도 가슴 무게 밖은 가운데보다 한참 덜 오르고, 어깨 끝은
    가슴이 오르는 양의 shoulder 배쯤만 오른다. 쿤 원판·행 단위 사상은 이 셋이 같다."""
    src, anat, cfg, rows, cols = _marked(h)
    lift = cfg["depth"] * anat.basis_rows
    reach = int(lift) + 4
    got = B.phase_frame(src, cfg, INHALE, anat)
    center = _rise(src, got, rows["chest"], cols["axis"], reach)
    side = _rise(src, got, rows["chest"], cols["side"], reach)
    tip = _rise(src, got, rows["shoulder"], cols["tip"], reach)
    assert center == pytest.approx(lift, abs=0.3)
    assert side < 0.35 * center, f"가슴 행의 옆({side:.2f}px)이 가운데({center:.2f}px)만큼 올랐다 — 가로줄 통째다"
    assert 0.25 * center < tip < 0.8 * center, \
        f"어깨 끝이 {tip:.2f}px — 가슴({center:.2f}px)의 shoulder {cfg['shoulder']} 배쯤 달싹여야 한다"


def test_the_neck_holds_while_the_shoulder_beside_it_breathes() -> None:
    """목은 목 너비만 붙잡는다 — 강체 경계 바로 아래, 목 가운데는 거의 그대로지만 같은 높이의 목
    바로 옆(어깨)은 이미 숨을 쉰다. 행 전체를 오래 붙잡으면 목 옆에 높이 붙은 어깨가 묶인다."""
    src = _bust(1000)
    anat = analyze(src)
    cfg = _cfg({"mode": "smooth"})                   # 기본 모양·진폭
    lo, hi = anat.neck_span
    top, end = B.smooth_band(anat)
    y = np.array([top + 0.25 * (end - top)])
    lift = cfg["depth"] * anat.basis_rows
    _, neck = B.smooth_displacement(anat, cfg, np.array([0.5 * (lo + hi + 1)]), y, 1.0, 1.0)
    _, beside = B.smooth_displacement(anat, cfg, np.array([hi + 0.8 * (hi - lo + 1)]), y, 1.0, 1.0)
    assert -neck[0] < 0.05 * lift, f"목 가운데가 {-neck[0]:.2f}px 오른다 — 목은 거의 그대로여야 한다"
    assert -beside[0] > 0.6 * cfg["shoulder"] * lift, \
        f"목 옆 어깨가 {-beside[0]:.2f}px — 가슴({lift:.2f}px)의 shoulder 배 가까이 올라야 한다"


def test_the_shoulders_follow_the_chest_a_little_late() -> None:
    src, anat, cfg, rows, cols = _marked()
    lift = cfg["depth"] * anat.basis_rows
    reach = int(lift) + 4
    frames, _ = _phase_frames(src, cfg, 60)          # breaths 2 — 한 호흡 30칸
    chest = [_rise(src, f, rows["chest"], cols["axis"], reach) for f in frames[:30]]
    tip = [_rise(src, f, rows["shoulder"], cols["tip"], reach) for f in frames[:30]]
    assert int(np.argmax(tip)) > int(np.argmax(chest)), \
        f"어깨 정점({int(np.argmax(tip))}칸)이 가슴 정점({int(np.argmax(chest))}칸)보다 늦지 않다"


def test_a_loop_breathes_exactly_breaths_times() -> None:
    for breaths, count in ((1, 18), (2, 24), (3, 30)):
        src, anat, cfg, rows, cols = _marked(breaths=breaths)
        reach = int(cfg["depth"] * anat.basis_rows) + 4
        frames, _ = _phase_frames(src, cfg, count)
        rises = [_rise(src, f, rows["chest"], cols["axis"], reach) for f in frames]
        assert rises[0] == 0.0
        peaks = [i for i in range(count)
                 if rises[i] > rises[i - 1] and rises[i] >= rises[(i + 1) % count] and rises[i] > 0.5]
        assert len(peaks) == breaths, f"breaths {breaths}: 정점 {len(peaks)}개 — {np.round(rises, 2)}"
        assert min(rises) >= -0.05, "가슴이 쉼 자리 아래로 내려갔다 — 숨은 올랐다 돌아올 뿐이다"


# ── 5·6. 경계에 이음새·찢김 없음 (1000px 판 포함) ──────────────────

@pytest.mark.parametrize("h", [120, 1000], ids=["small", "1000px"])
def test_no_seam_or_tear_between_the_head_and_the_body(h: int) -> None:
    src = _bust(h)
    anat = analyze(src)
    box = solid_alpha_bbox(src)
    slope = 180.0 / (h - 1)
    cfg = _cfg(_smooth())
    for phase in (0.25, INHALE, 0.6):
        got = np.asarray(B.phase_frame(src, cfg, phase, anat)).astype(int)
        for column in (box[0] + anat.axis_x, box[0] + anat.axis_x + int(B.SHOULDER_X * anat.torso_half)):
            red = got[box[1]:box[3], column, 0]           # 정수리부터 발끝까지 — 경계를 가로지른다
            red = red[got[box[1]:box[3], column, 3] == 255]
            steps = np.diff(red)
            assert steps.min() >= 0, f"위상 {phase} {column}열: 기울기가 거꾸로 섰다 — 행이 접혔다"
            assert steps.max() <= slope * (1 + B.MAX_ROW_STRAIN) + 1.0, \
                f"위상 {phase} {column}열: 한 행에 {steps.max()} 뛰었다 — 이음새(행 빠짐)다"
        inner = int(np.ceil(h * 0.46 + cfg["depth"] * anat.basis_rows)) + 2
        for y in range(inner, box[3]):                    # 몸통 안이 끊기지 않는다 (윗변은 어깨가
            alpha = got[y, :, 3]                          # 들리며 모양이 바뀌는 자리라 뺀다)
            inside = np.nonzero(alpha)[0]
            if inside.size:
                run = alpha[inside[0]:inside[-1] + 1]
                assert (run > 0).all(), f"위상 {phase} {y}행: 몸통 안에 구멍이 났다"


# ── 7. pixel 기본은 바이트 같다 ─────────────────────────────────────

# 이 플랜 전(59b2738)의 굽기 결과 — breaths 2, 12칸. 기본 경로가 한 바이트라도 바뀌면 깨진다.
# `_outlined_figure` 는 굽기를 numpy 로 바꾸기 전(17f7490)에 잰 값이다 — 다듬기가 실제로 지우고 옮기는 큰 그림.
PIXEL_GOLDEN = {
    "_humanoid": "4f212002c8cec96f4b207b56eec5195b2549069bbc066511385e3a92c74c1fcc",
    "_winged": "5bdf0c0997cf799bc7e3a82374dce16fb65db3545fb3a5f1f1df7b249fcbaf0d",
    "_dome": "492db9827109db3cf48d655437d102f22b1db4843d7121c4f4c65ea3a9fee443",
    "_outlined_figure": "3dbc6bb827eb3d7b2fdbe96e3f1a7a2c094cbb99e1880a523341ce1cbc627c63",
}
PIXEL_KEYS = ["anatomy", "axis_x", "breaths", "depth", "depth_x", "lag", "rigid_row", "torso_half"]


@pytest.mark.parametrize("build", [_humanoid, _winged, _dome, _outlined_figure], ids=lambda b: b.__name__)
@pytest.mark.parametrize("mode", [None, "pixel"], ids=["mode-omitted", "mode-pixel"])
def test_the_default_pixel_mode_is_byte_identical_to_before(build, mode) -> None:
    raw = {"depth": 0.06, "breaths": 2, "lag": 0.1}
    if mode:
        raw["mode"] = mode
    cfg = _cfg(raw)
    if mode is None:
        assert sorted(cfg) == PIXEL_KEYS, f"mode 를 안 적은 사이드카의 정규화가 바뀌었다: {sorted(cfg)}"
    frames, _ = B.bake_breathe_sequence([build()] * 12, cfg)
    digest = hashlib.sha256(b"".join(f.tobytes() for f in frames)).hexdigest()
    assert digest == PIXEL_GOLDEN[build.__name__], f"{build.__name__}: pixel 굽기가 바뀌었다"


# ── 8. 사이드카 ─────────────────────────────────────────────────────

SHAPE = ("chest_y", "chest_rx", "chest_ry", "shoulder", "shoulder_lag", "chest_tilt", "chest_bias", "chest_dir",
         "chest_x", "chest_bias_y", "chest_flat", "inhale")


def test_the_sidecar_reads_mode_depth_breaths_and_the_shape() -> None:
    cfg = _cfg({"mode": "smooth", "depth": 0.02, "breaths": 2})
    assert cfg["mode"] == "smooth" and cfg["depth"] == 0.02 and cfg["breaths"] == 2
    assert "lag" not in cfg, "smooth 에는 진행파가 없다"
    omitted = _cfg({"mode": "smooth", "breaths": 2})
    assert omitted["depth"] == B.DEFAULT_SMOOTH_DEPTH
    assert omitted["depth_x"] == B.DEFAULT_SMOOTH_DEPTH_X
    assert {k: omitted[k] for k in SHAPE} == B.SMOOTH_SHAPE, "모양 값 기본이 굽기와 다르다"
    given = _cfg({"mode": "smooth", "chest_y": 0.4, "chest_rx": 0.8, "chest_ry": 0.3,
                  "shoulder": 0.6, "shoulder_lag": 0.1})
    assert {k: given[k] for k in SHAPE} == {"chest_y": 0.4, "chest_rx": 0.8, "chest_ry": 0.3,
                                            "shoulder": 0.6, "shoulder_lag": 0.1,
                                            "chest_tilt": 0.0, "chest_bias": 0.0, "chest_dir": 0.0,
                                            "chest_x": 0.0, "chest_bias_y": 0.0, "chest_flat": 0.0, "inhale": 0.4}
    assert _cfg({"mode": "pixel", "breaths": 2})["mode"] == "pixel"


def test_the_shape_moves_the_bake() -> None:
    """모양 값은 이름만 있는 게 아니다 — 가슴 높이를 바꾸면 다른 그림이 구워진다."""
    src = _bust()
    a = B.phase_frame(src, _cfg(_smooth()), INHALE)
    b = B.phase_frame(src, _cfg(_smooth(chest_y=0.6)), INHALE)
    c = B.phase_frame(src, _cfg(_smooth(shoulder=0.0)), INHALE)
    assert a.tobytes() != b.tobytes() and a.tobytes() != c.tobytes()


@pytest.mark.parametrize("bad", ["soft", "", 1, ["smooth"]])
def test_an_unknown_mode_is_refused_loudly(bad) -> None:
    with pytest.raises(SystemExit, match="mode"):
        _cfg({"mode": bad, "breaths": 2})


@pytest.mark.parametrize("key,value", [("chest_y", 0.0), ("chest_rx", 9.0), ("chest_ry", -1),
                                       ("shoulder", 3.0), ("shoulder_lag", 0.5), ("chest_y", "x"),
                                       ("chest_tilt", 75), ("chest_bias", -1.0), ("chest_dir", 120),
                                       ("chest_x", 1.5), ("chest_bias_y", 0.95), ("chest_flat", 0.95),
                                       ("inhale", 0.1), ("inhale", 0.85)])
def test_a_shape_value_out_of_range_is_refused(key, value) -> None:
    with pytest.raises(SystemExit, match=key):
        _cfg(_smooth(**{key: value}))


@pytest.mark.parametrize("key,value", [("chest_y", 0.3), ("inhale", 0.42)])
def test_a_shape_value_on_pixel_is_refused_not_ignored(key, value) -> None:
    with pytest.raises(SystemExit, match=key):
        _cfg({"depth": 0.06, "breaths": 2, key: value})


def test_the_sidecar_picks_the_smooth_warp() -> None:
    """사이드카가 smooth 면 굽기가 정말 smooth 로 굽는다 — 원본에 없던 사잇값 색이 생긴다.
    pixel 은 원본 픽셀을 옮기기만 해서 새 색이 없다."""
    src = _bust()
    colors = {tuple(p) for p in np.asarray(src).reshape(-1, 4)}
    smooth, _ = B.bake_breathe_sequence([src] * 8, _cfg(_smooth()))
    pixel, _ = B.bake_breathe_sequence([src] * 8, _cfg({"depth": 0.06, "breaths": 2}))
    new_smooth = {tuple(p) for f in smooth for p in np.asarray(f).reshape(-1, 4)} - colors
    new_pixel = {tuple(p) for f in pixel for p in np.asarray(f).reshape(-1, 4)} - colors
    assert new_smooth, "smooth 사이드카인데 사잇값이 하나도 없다 — pixel 로 구웠다"
    assert not new_pixel


# ── 8b. 몸이 향한 쪽 — 타원 기울기, 앞쪽 치우침, 가슴이 가는 방향 ──────

# `cfbf5d3`(이 셋이 생기기 전) 의 smooth 굽기 — 12칸. 중립값(0)이나 생략이면 이 바이트 그대로다.
SMOOTH_GOLDEN = [
    (120, {"mode": "smooth", "breaths": 2}, "e35f051ec9a998b2908fc2a2b08a3c3bae0374fd538a0ed3c388f885ac043d1d"),
    (120, {"mode": "smooth", "depth": 0.02, "breaths": 2, "depth_x": 0.04},
     "85325d5280d32acccb66c05f123f6cbc1d81b71c10d15ec7cfe7f603c517a788"),
    (400, {"mode": "smooth", "breaths": 1}, "b0b92dec97874838a616a50683724c1eb79557bf7cceef1093bb8fe7c0a5b574"),
]


@pytest.mark.parametrize("h,raw,digest", SMOOTH_GOLDEN, ids=["default", "deeper", "400px"])
@pytest.mark.parametrize("neutral", [{}, {"chest_tilt": 0, "chest_bias": 0, "chest_dir": 0, "chest_x": 0,
                                       "chest_bias_y": 0, "chest_flat": 0}], ids=["omitted", "zeros"])
def test_neutral_facing_values_bake_the_same_bytes(h, raw, digest, neutral) -> None:
    frames, _ = B.bake_breathe_sequence([_bust(h)] * 12, _cfg({**raw, **neutral}))
    assert hashlib.sha256(b"".join(f.tobytes() for f in frames)).hexdigest() == digest, \
        "몸 방향 값이 중립인데 smooth 굽기가 바뀌었다"


# 굽기를 빠르게 하기 전(17f7490)의 smooth 굽기 — 12칸. 몸 방향 값을 다 쓴 가슴과, 양옆 변에 닿은 흉상.
# 변위장을 움직이는 화소에서만 다시 풀어도 같은 바이트여야 한다.
SMOOTH_SPEEDUP_GOLDEN = [
    (dict(h=400), {"mode": "smooth", "breaths": 2, "chest_tilt": 20, "chest_bias": 0.4, "chest_dir": -15,
                   "chest_x": 0.1, "chest_bias_y": 0.2, "chest_flat": 0.2},
     "48e6f8f1d976efceca3fb73857375dd1db232c62302de8768ade505008bf7c10"),
    (dict(h=300, margin=0.0), {"mode": "smooth", "breaths": 1, "depth": 0.02},
     "c233ec9c948663308bfe70f1b5e5affc5229c0ef2be4f982c9f5168b45389186"),
]


@pytest.mark.parametrize("bust,raw,digest", SMOOTH_SPEEDUP_GOLDEN, ids=["facing", "cut-at-the-sides"])
def test_the_smooth_bake_keeps_its_bytes(bust, raw, digest) -> None:
    frames, _ = B.bake_breathe_sequence([_bust(**bust)] * 12, _cfg(raw))
    assert hashlib.sha256(b"".join(f.tobytes() for f in frames)).hexdigest() == digest, "smooth 굽기가 바뀌었다"


def _field(anat, cfg, x, y):
    dx, dy = B.smooth_displacement(anat, cfg, np.array([float(x)]), np.array([float(y)]), 1.0, 0.0)
    return float(dx[0]), float(dy[0])


def _chest_frame():
    src = _bust(1000)
    anat = analyze(src)
    return src, anat


def test_a_tilted_chest_weight_lies_along_its_tilt() -> None:
    """기울인 타원은 그 기울기를 따라 놓인다 — 기울인 긴 축 위의 점은 기울이기 전 수평 축 위의
    점과 같은 무게(같은 오름)를 받고, 그 자리의 수평 점은 덜 받는다. 화면에서 양수는 시계방향
    (오른쪽 끝이 내려간다)."""
    _, anat = _chest_frame()
    flat = _cfg(_smooth(depth_x=0.0))
    tilted = _cfg(_smooth(depth_x=0.0, chest_tilt=30))
    cx, cy = B.smooth_chest(anat, flat)
    d = 0.5 * flat["chest_rx"] * anat.torso_half
    t = np.radians(30.0)
    _, level = _field(anat, flat, cx + d, cy)
    _, along = _field(anat, tilted, cx + d * np.cos(t), cy + d * np.sin(t))
    _, off = _field(anat, tilted, cx + d, cy)
    assert along == pytest.approx(level, rel=1e-6), "기울인 긴 축 위의 점이 기울이기 전 수평 축의 무게를 안 받는다"
    assert -off < 0.9 * -level, "기울였는데 수평 자리가 그대로 무게를 받는다"
    left_up, right_down = (_field(anat, tilted, cx - d * np.cos(t), cy - d * np.sin(t))[1],
                           _field(anat, tilted, cx + d * np.cos(t), cy + d * np.sin(t))[1])
    assert left_up == pytest.approx(right_down, rel=1e-6), "기울기만으로는 좌우가 같아야 한다 (치우침은 따로)"


def test_the_front_side_breathes_more() -> None:
    """치우침은 무게의 꼭대기 P 를 긴 축 따라 옮긴다 — 음수면 화면 왼쪽(몸이 왼쪽을 볼 때의 앞쪽)이다.
    무게는 P 에서 그 반직선이 테두리에 닿는 곳까지 잰다: 가까운 쪽은 짧게, 돌아간 쪽은 길게 줄어든다."""
    _, anat = _chest_frame()
    cfg = _cfg(_smooth(depth_x=0.0, chest_bias=-0.5))
    cx, cy = B.smooth_chest(anat, cfg)
    rx = cfg["chest_rx"] * anat.torso_half
    lift = cfg["depth"] * anat.basis_rows
    px, py = B.smooth_chest_peak(anat, cfg)
    assert (px, py) == pytest.approx((cx - 0.5 * rx, cy))
    _, at_peak = _field(anat, cfg, px, py)
    _, right = _field(anat, cfg, cx + 0.5 * rx, cy)          # P 에서 rx, 오른쪽 테두리까지 1.5 rx: 2/3
    assert -at_peak == pytest.approx(lift, rel=1e-6)
    assert -right == pytest.approx(lift * np.cos(np.pi / 3) ** 2, rel=1e-6)
    # 무게가 절반이 되는 거리: 왼쪽(가까운 쪽)은 P 에서 0.25 rx, 오른쪽(돌아간 쪽)은 0.75 rx.
    _, near = _field(anat, cfg, px - 0.25 * rx, py)
    _, far = _field(anat, cfg, px + 0.75 * rx, py)
    assert -near == pytest.approx(0.5 * lift, rel=1e-6) and -far == pytest.approx(0.5 * lift, rel=1e-6)


def test_the_peak_moves_across_the_long_axis_too() -> None:
    _, anat = _chest_frame()
    cfg = _cfg(_smooth(depth_x=0.0, chest_bias=-0.4, chest_bias_y=0.3, chest_tilt=12))
    cx, cy = B.smooth_chest(anat, cfg)
    rx, ry = cfg["chest_rx"] * anat.torso_half, cfg["chest_ry"] * (anat.height - anat.rigid_row)
    t = np.radians(12.0)
    along, across = -0.4 * rx, 0.3 * ry
    want = (cx + along * np.cos(t) - across * np.sin(t), cy + along * np.sin(t) + across * np.cos(t))
    assert B.smooth_chest_peak(anat, cfg) == pytest.approx(want)
    lift = cfg["depth"] * anat.basis_rows
    assert -_field(anat, cfg, *want)[1] == pytest.approx(lift, rel=1e-6), "꼭대기에서 가슴이 depth 만큼 오르지 않는다"


def test_chest_x_moves_the_chest_off_the_body_axis() -> None:
    """긴 머리처럼 한쪽으로 쏠린 것이 몸통 축(무게중심)을 끌면 가슴은 축에 없다 — chest_x 로 옮긴다."""
    _, anat = _chest_frame()
    cfg = _cfg(_smooth(depth_x=0.0, chest_x=-0.2))
    cx, cy = B.smooth_chest(anat, cfg)
    assert cx == pytest.approx(anat.axis_x + 0.5 - 0.2 * anat.torso_half)
    lift = cfg["depth"] * anat.basis_rows
    assert -_field(anat, cfg, cx, cy)[1] == pytest.approx(lift, rel=1e-6)
    assert -_field(anat, cfg, anat.axis_x + 0.5, cy)[1] < lift


def test_a_flat_top_carries_the_whole_lift() -> None:
    _, anat = _chest_frame()
    cfg = _cfg(_smooth(depth_x=0.0, chest_flat=0.3))
    cx, cy = B.smooth_chest(anat, cfg)
    rx = cfg["chest_rx"] * anat.torso_half
    lift = cfg["depth"] * anat.basis_rows
    assert -_field(anat, cfg, cx + 0.25 * rx, cy)[1] == pytest.approx(lift, rel=1e-6), "평평한 꼭대기 안인데 덜 오른다"
    assert -_field(anat, cfg, cx + 0.6 * rx, cy)[1] < lift


def test_the_chest_puffs_out_from_its_peak() -> None:
    """부풂의 원점은 꼭대기 P 다 — P 는 옆으로 가지 않고, 그 양옆은 바깥으로 간다."""
    _, anat = _chest_frame()
    cfg = _cfg(_smooth(depth_x=0.02, chest_bias=-0.4))
    px, py = B.smooth_chest_peak(anat, cfg)
    rx = cfg["chest_rx"] * anat.torso_half
    assert _field(anat, cfg, px, py)[0] == pytest.approx(0.0, abs=1e-9)
    assert _field(anat, cfg, px - 0.2 * rx, py)[0] < 0 < _field(anat, cfg, px + 0.2 * rx, py)[0]


def test_a_peak_off_the_ellipse_is_refused() -> None:
    with pytest.raises(SystemExit, match="chest_bias"):
        _cfg(_smooth(chest_bias=-0.8, chest_bias_y=0.8))


# ── 숨 박자를 바깥에서: 들숨 꼭대기 칸 목록 ───────────────────────

def test_breath_peaks_put_each_in_breath_where_asked() -> None:
    """`breath_peaks` 는 들숨 꼭대기 칸이다 — 그 칸에서 숨이 가득 차고, 첫 칸은 쉼(원본 그대로),
    루프 끝은 다시 쉼으로 닫힌다. 꼭대기 사이는 날숨이 먼저 6할, 다음 들숨이 4할을 쓴다."""
    cfg = _cfg(_smooth(breath_peaks=[10, 40, 52], breaths=None))
    assert cfg["breaths"] == 3 and cfg["breath_peaks"] == [10, 40, 52]
    phases = B.fit_breathe_pattern(60, cfg)
    curve = [B.smooth_wave(t, INHALE) for t in phases]
    assert phases[0] == 0.0 and curve[0] == 0.0
    for p in (10, 40, 52):
        assert curve[p] == pytest.approx(1.0), f"{p}번 칸이 들숨 꼭대기가 아니다: {curve[p]}"
    rests = [i for i in range(1, 60) if curve[i] < curve[i - 1] and curve[i] <= curve[(i + 1) % 60]]
    assert rests == [28, 47], f"숨 사이 쉼이 꼭대기 사이 날숨 6할 자리에 있어야 한다: {rests}"
    assert curve[59] < curve[58], "루프 끝이 쉼으로 돌아가지 않는다"
    src = _bust()
    frames, _ = B.bake_breathe_sequence([src] * 60, cfg)
    assert frames[0].tobytes() == src.tobytes()


@pytest.mark.parametrize("raw,why", [
    ({"breath_peaks": [10, 10]}, "breath_peaks"), ({"breath_peaks": [12, 5]}, "breath_peaks"),
    ({"breath_peaks": [0, 20]}, "breath_peaks"), ({"breath_peaks": [10, 2.5]}, "breath_peaks"),
    ({"breath_peaks": [10, 40], "breaths": 3}, "breaths"),
], ids=["repeat", "unsorted", "first-cell", "not-int", "count-mismatch"])
def test_breath_peaks_that_cannot_be_kept_are_refused(raw, why) -> None:
    with pytest.raises(SystemExit, match=why):
        _cfg({"mode": "smooth", **raw})


def test_breath_peaks_past_the_loop_are_refused_at_the_bake() -> None:
    with pytest.raises(SystemExit, match="breath_peaks"):
        B.fit_breathe_pattern(30, _cfg(_smooth(breath_peaks=[10, 29], breaths=None)))


def test_breath_peaks_on_pixel_are_refused() -> None:
    with pytest.raises(SystemExit, match="breath_peaks"):
        _cfg({"depth": 0.06, "breath_peaks": [5, 15]})


# ── 들숨 몫: 한 호흡에서 들숨이 차지하는 몫은 줄의 값 ────────────────

def test_the_in_breath_takes_the_rows_inhale_share() -> None:
    """`inhale` 은 한 호흡에서 들숨이 차지하는 몫이다 — 들숨 몫 0.42 인 줄은 위상 0.21 에 들숨 절반, 0.42 에 꼭대기이고,
    그 칸들은 기본 줄(0.40)의 위상 0.20·0.40 칸과 바이트 같다. 어깨 지연을 0 으로 두면 어깨도 같은 곡선을 타서 칸이 곡선
    값 하나로 정해진다."""
    src = _bust(400)
    anat = analyze(src)
    row = _cfg(_smooth(inhale=0.42, shoulder_lag=0.0))
    default = _cfg(_smooth(shoulder_lag=0.0))
    for share in (0.5, 1.0):
        want = B.phase_frame(src, default, share * INHALE, anat).tobytes()
        assert want != src.tobytes()
        assert B.phase_frame(src, row, share * 0.42, anat).tobytes() == want, \
            f"들숨 몫 0.42 인데 위상 {share * 0.42:g} 가 들숨의 {share:g} 자리가 아니다"
    assert row["inhale"] == 0.42 and default["inhale"] == INHALE


def test_breath_peaks_split_the_breaths_at_the_rows_inhale_share() -> None:
    """꼭대기 칸을 바깥에서 받아도 숨 사이 쉼은 꼭대기 사이를 날숨 1-inhale : 들숨 inhale 로 나누는 자리다 — 들숨 몫
    0.42 면 10·40 칸 꼭대기 사이 쉼은 10 + 0.58 × 30 = 27.4 이고, 28 칸이 다음 숨의 들숨 0.42 × 0.6 / 12.6 자리다."""
    cfg = _cfg(_smooth(breath_peaks=[10, 40, 52], breaths=None, inhale=0.42))
    phases = B.fit_breathe_pattern(60, cfg)
    assert phases[27] > 0.9 and phases[28] == pytest.approx(0.42 * (28 - 27.4) / (40 - 27.4))
    assert [B.smooth_wave(phases[p], 0.42) for p in (10, 40, 52)] == pytest.approx([1.0, 1.0, 1.0])


# ── 루프의 한 토막: 루프 세트의 들어감·나옴 조각이 루프의 숨을 그 칸에서 잇는다 ──────────

@pytest.mark.parametrize("beat", [{"breaths": 2}, {"breath_peaks": [10, 34], "breaths": None}], ids=["breaths", "peaks"])
@pytest.mark.parametrize("start,count", [(13, 17), (40, 20), (0, 48), (5, 48)],
                         ids=["inside", "past-the-close", "whole", "turned"])
def test_a_stretch_breathes_each_cell_at_its_loop_cells_phase(beat, start, count) -> None:
    """`loop_cells`·`start_cell` 이면 줄은 그 루프의 한 토막이다 — 칸 i 의 위상은 루프 칸 (start_cell + i) mod
    loop_cells 의 위상, 같은 double 이다. 루프 끝을 넘으면 루프 처음(쉼)으로 돈다. 숨 박자는 루프의 것이다."""
    loop = B.fit_breathe_pattern(48, _cfg(_smooth(**beat)))
    cfg = _cfg(_smooth(**beat, loop_cells=48, start_cell=start))
    assert cfg["loop_cells"] == 48 and cfg["start_cell"] == start
    assert B.breathe_loop(count, cfg) == loop
    assert B.fit_breathe_pattern(count, cfg) == [loop[(start + i) % 48] for i in range(count)]


@pytest.mark.parametrize("start,count", [(31, 20), (0, 16), (8, 16), (40, 16), (0, 96)],
                         ids=["way-in", "way-out-0", "way-out-8", "way-out-40", "loop"])
def test_a_stretch_has_the_phases_the_pad_laid_it_at(start, count) -> None:
    """토막의 위상은 손 단계(pad)가 내던 위상과 같은 double 이다 — 조각을 48칸 숨 m 번인 48m 칸 열의 제 위상 칸에
    깔고(앞뒤는 기준 칸, 위상 0 이면 둘째 숨 첫 칸) 그 열에 숨을 넣어 조각 칸만 읽던 것. 48칸 숨 둘인 96칸 루프의 한
    토막으로 말하면 엔진이 같은 위상을 낸다."""
    p = start or 48
    m = -(-(p + count) // 48)
    padded = B.fit_breathe_pattern(48 * m, _cfg(_smooth(breaths=m)))
    stretch = B.fit_breathe_pattern(count, _cfg(_smooth(breaths=2, loop_cells=96, start_cell=start)))
    assert stretch == padded[p:p + count]


def test_a_row_without_the_stretch_is_its_own_loop() -> None:
    """생략은 줄이 곧 루프다 — 정규화가 start_cell 0, loop_cells None 을 싣고 위상이 이전 식 그대로(같은 double)다.
    start_cell 만 주면 제 루프를 그 칸부터 돈다."""
    for raw in (_smooth(), _smooth(breath_peaks=[10, 34], breaths=None)):
        cfg = _cfg(raw)
        assert cfg["start_cell"] == 0 and cfg["loop_cells"] is None
    cfg = _cfg(_smooth(breaths=3))
    own = B.fit_breathe_pattern(30, cfg)
    assert own == [((i * 3) % 30) / 30 for i in range(30)] == B.breathe_loop(30, cfg)
    assert B.fit_breathe_pattern(30, _cfg(_smooth(breaths=3, start_cell=7))) == [own[(7 + i) % 30] for i in range(30)]


@pytest.mark.parametrize("raw,why", [
    (_smooth(loop_cells=24, start_cell=24), "start_cell"), (_smooth(start_cell=-1), "start_cell"),
    (_smooth(start_cell=2.5), "start_cell"), (_smooth(loop_cells=1), "loop_cells"),
    (_smooth(loop_cells="many"), "loop_cells"),
    ({"depth": 0.06, "breaths": 2, "start_cell": 3}, "start_cell"), ({"depth": 0.06, "breaths": 2, "loop_cells": 48}, "loop_cells"),
], ids=["past-the-loop", "negative", "not-int", "one-cell", "not-a-number", "start-on-pixel", "loop-on-pixel"])
def test_a_stretch_that_cannot_be_kept_is_refused(raw, why) -> None:
    with pytest.raises(SystemExit, match=why):
        _cfg(raw)


def test_a_start_past_the_rows_own_loop_is_refused_at_the_bake() -> None:
    """loop_cells 를 생략하면 루프는 줄의 칸 수라 start_cell 의 끝은 굽기가 본다 — 조용히 접지 않는다. 루프의 꼭대기 칸도
    그 루프 안에 들어야 한다."""
    with pytest.raises(SystemExit, match="start_cell"):
        B.fit_breathe_pattern(30, _cfg(_smooth(start_cell=30)))
    with pytest.raises(SystemExit, match="breath_peaks"):
        B.fit_breathe_pattern(30, _cfg(_smooth(breath_peaks=[10, 40], breaths=None, loop_cells=41)))


@pytest.mark.parametrize("angle", [-30.0, 20.0])
def test_the_chest_moves_along_its_direction(angle) -> None:
    """가슴 가운데는 `chest_dir` 쪽으로 간다 — 0 이 바로 위, 음수가 왼쪽 위. 크기는 그대로
    depth × 기준 높이다. 어깨는 위로만 달싹인다."""
    src, anat = _chest_frame()
    cfg = _cfg(_smooth(depth_x=0.0, chest_dir=angle))
    cx, cy = B.smooth_chest(anat, cfg)
    lift = cfg["depth"] * anat.basis_rows
    dx, dy = _field(anat, cfg, cx, cy)
    t = np.radians(angle)
    assert (dx, dy) == pytest.approx((lift * np.sin(t), -lift * np.cos(t)), rel=1e-6)
    # 픽셀로도: 가슴 가운데에 그은 세로선이 그 방향의 가로 성분만큼 옆으로 간다.
    box = solid_alpha_bbox(src)
    a = np.asarray(_bust(1000, gradient=False)).copy()
    row, col = box[1] + int(cy), box[0] + int(cx)
    a[row - 24:row + 25, col] = MARK                   # 위로 가도 그 행에 선이 남게 길게
    marked = Image.fromarray(a, "RGBA")
    got = np.asarray(B.phase_frame(marked, cfg, INHALE, anat), np.float64)

    def centre(img):
        line = img[row, col - 12:col + 13, :3].mean(axis=1)
        weight = np.clip(sum(BODY[:3]) / 3.0 - line, 0.0, None)
        return float((weight * np.arange(col - 12, col + 13)).sum() / weight.sum())

    shift = centre(got) - centre(np.asarray(marked, np.float64))
    assert shift == pytest.approx(lift * np.sin(t), abs=0.35), f"가슴이 옆으로 {shift:.2f}px — {lift * np.sin(t):.2f}px 여야 한다"


def test_facing_values_keep_the_head_still() -> None:
    src = _bust(1000)
    anat = analyze(src)
    cut = solid_alpha_bbox(src)[1] + anat.rigid_row
    cfg = _cfg(_smooth(chest_tilt=-25, chest_bias=-0.6, chest_dir=-35))
    for phase in (0.2, INHALE, 0.7):
        got = B.phase_frame(src, cfg, phase, anat)
        assert np.asarray(got)[:cut].tobytes() == np.asarray(src)[:cut].tobytes(), \
            f"위상 {phase}: 몸 방향 값을 줬더니 목·턱 위가 움직였다"


# ── 9. lag ──────────────────────────────────────────────────────────

def test_a_lag_on_smooth_is_refused_not_dropped() -> None:
    with pytest.raises(SystemExit, match="lag"):
        _cfg(_smooth(lag=0.1))
    with pytest.raises(SystemExit, match="lag"):
        B.phase_frame(_bust(), {**_smooth(), "lag": 0.1}, 0.3)
    assert "lag" not in _cfg(_smooth(lag=0))        # 0 은 smooth 가 하는 일 그대로라 받는다


# ── 10. 화면 변 ─────────────────────────────────────────────────────

def test_a_figure_cut_by_the_frame_is_not_refused() -> None:
    """양옆·아래 변에 닿은 흉상 — 가슴 무게는 화면 안에서 0 으로 떨어지고 머리·발바닥은
    제자리라, 원본 내용이 화면 밖으로 밀려 나가지 않는다. pixel 의 '셀 밖으로 나가 잘린다'
    거부를 물려받지 않는다."""
    src = _bust(margin=0.0)
    anat = analyze(src)
    w, h = src.size
    for phase in (0.2, INHALE, 0.7):
        got = np.asarray(B.phase_frame(src, _cfg(_smooth()), phase, anat))
        assert (got[-1, :, 3] == np.asarray(src)[-1, :, 3]).all(), "아래 변이 비었다 — 발바닥이 떴다"
        for col in (0, w - 1):                       # 원본이 변까지 찬 행은 그대로 찬다
            rows = np.nonzero(np.asarray(src)[:, col, 3] == 255)[0]
            assert rows.size and (got[rows, col, 3] == 255).all(), f"{col}열: 옆 변이 비었다"


def test_a_swell_reaching_past_the_canvas_is_still_refused() -> None:
    """가슴 무게를 화면보다 넓게 잡으면(chest_rx) 가로 부풀림이 변의 내용을 밖으로 민다 — 그때는
    pixel 과 같이 조용히 자르지 않고 멈춘다. 기본 모양에서는 생기지 않는다(위 시험)."""
    src = _bust(margin=0.0)
    with pytest.raises(SystemExit, match="셀 밖"):
        B.phase_frame(src, _cfg(_smooth(depth=0.01, chest_rx=2.5, depth_x=0.05)), INHALE)
    # 가슴 안에 그은 세로선은 depth_x 만큼 가운데에서 바깥으로 밀린다 (실루엣 밖 변은 그대로).
    probe = _bust(margin=0.12, gradient=False)
    anat = analyze(probe)
    cfg = _cfg(_smooth(depth=0.01, depth_x=0.05))
    box = solid_alpha_bbox(probe)
    cx, cy = B.smooth_chest(anat, cfg)
    row = box[1] + int(cy)
    a = np.asarray(probe).copy()
    col = box[0] + int(cx + 0.4 * cfg["chest_rx"] * anat.torso_half)
    a[row - 4:row + 5, col] = MARK
    roomy = Image.fromarray(a, "RGBA")
    still = np.asarray(B.phase_frame(roomy, {**cfg, "depth_x": 0.0}, INHALE, anat), np.float64)
    puffed = np.asarray(B.phase_frame(roomy, cfg, INHALE, anat), np.float64)

    def centre(img):
        line = img[row, col - 4:col + 5, :3].mean(axis=1)
        weight = np.clip(sum(BODY[:3]) / 3.0 - line, 0.0, None)
        return float((weight * np.arange(col - 4, col + 5)).sum() / weight.sum())

    assert centre(puffed) - centre(still) > 0.2, "depth_x 를 줬는데 가슴이 안 부풀었다"


def test_a_strain_past_the_cap_is_refused() -> None:
    with pytest.raises(SystemExit, match="smooth"):
        B.phase_frame(_bust(), _cfg(_smooth(depth=0.2)), INHALE)


# ── CLI: 같은 값, 같은 함수 ────────────────────────────────────────

def _blinking(h: int = 120, count: int = 12) -> list[Image.Image]:
    """칸마다 조금씩 다른 프레임 — 눈을 감았다 뜨는 칸이 섞인 영상 루프의 축소판."""
    frames = []
    for i in range(count):
        im = _bust(h)
        if i in (5, 6):
            a = np.asarray(im).copy()
            a[a[..., 0] == EYE[0]] = SKIN
            im = Image.fromarray(a, "RGBA")
        frames.append(im)
    return frames


@pytest.mark.parametrize("raw,flags", [
    (_smooth(), ["--mode", "smooth", "--depth", "0.025", "--breaths", "2"]),
    (_smooth(chest_y=0.4, shoulder=0.3, shoulder_lag=0.12, depth_x=0.01, chest_tilt=-20, chest_bias=-0.4,
             chest_dir=-25, chest_x=-0.1, chest_bias_y=0.2, chest_flat=0.25, inhale=0.42),
     ["--mode", "smooth", "--depth", "0.025", "--breaths", "2", "--chest-y", "0.4",
      "--shoulder", "0.3", "--shoulder-lag", "0.12", "--depth-x", "0.01", "--chest-tilt", "-20",
      "--chest-bias", "-0.4", "--chest-dir", "-25", "--chest-x", "-0.1", "--chest-bias-y", "0.2",
      "--chest-flat", "0.25", "--inhale", "0.42"]),
    (_smooth(breath_peaks=[3, 9], breaths=None), ["--mode", "smooth", "--depth", "0.025", "--breath-peaks", "3,9"]),
    (_smooth(loop_cells=30, start_cell=23),
     ["--mode", "smooth", "--depth", "0.025", "--breaths", "2", "--loop-cells", "30", "--start-cell", "23"]),
    ({"depth": 0.06, "breaths": 2, "lag": 0.1},
     ["--depth", "0.06", "--breaths", "2", "--lag", "0.1"]),
], ids=["smooth", "smooth-shape", "smooth-peaks", "smooth-stretch", "pixel"])
def test_the_cli_bakes_what_the_curation_bake_bakes(tmp_path, raw, flags) -> None:
    from sprite_gen import cli

    frames = _blinking()
    src = tmp_path / "loop"
    src.mkdir()
    for i, im in enumerate(frames):
        im.save(src / f"frame-{i:03d}.png")
    out = tmp_path / "out"
    assert cli.main(["breathe", str(src), str(out), *flags]) == 0
    expect, phases = B.bake_breathe_sequence(frames, _cfg(raw))
    got = sorted(out.glob("frame-*.png"))
    assert [p.name for p in got] == [f"frame-{i:03d}.png" for i in range(len(frames))]
    for i, (path, want) in enumerate(zip(got, expect)):
        with Image.open(path) as im:
            assert im.convert("RGBA").tobytes() == want.tobytes(), f"{i}번 칸이 큐레이션 굽기와 다르다"
    report = json.loads((out / "breathe.json").read_text(encoding="utf-8"))
    assert report["config"] == json.loads(json.dumps(_cfg(raw)))
    assert report["phases"] == phases
    assert report["resolved"]["anatomy"]["rigid_row"] == analyze(frames[0]).rigid_row


def test_the_cli_measures_the_row_once(tmp_path, monkeypatch) -> None:
    """`sprite-gen breathe` 는 기준 칸을 한 번 잰다 — 보고와 굽기가 같은 해부를 쓴다. 행당 변형도 줄에 한 번
    잰다 — 해부와 설정에만 달린 값이다. 960 칸 하나에 해부가 약 0.5 초, 행당 변형이 약 0.03 초다."""
    from sprite_gen import cli

    calls = {"analyze": 0, "smooth_strain": 0}
    for name in calls:
        real = getattr(B, name)

        def counted(*args, _real=real, _name=name, **kwargs):
            calls[_name] += 1
            return _real(*args, **kwargs)

        monkeypatch.setattr(B, name, counted)
    src = tmp_path / "loop"
    src.mkdir()
    for i, im in enumerate(_blinking()):
        im.save(src / f"frame-{i:03d}.png")
    assert cli.main(["breathe", str(src), str(tmp_path / "out"), "--mode", "smooth", "--breaths", "2"]) == 0
    assert calls == {"analyze": 1, "smooth_strain": 1}


def test_the_cli_refuses_what_the_sidecar_refuses(tmp_path) -> None:
    from sprite_gen import cli

    src = tmp_path / "loop"
    src.mkdir()
    _bust().save(src / "frame-000.png")
    with pytest.raises(SystemExit, match="lag"):
        cli.main(["breathe", str(src), str(tmp_path / "a"), "--mode", "smooth", "--lag", "0.1"])
    with pytest.raises(SystemExit, match="depth"):
        cli.main(["breathe", str(src), str(tmp_path / "b"), "--depth", "0.5"])
    with pytest.raises(SystemExit, match="chest_y"):
        cli.main(["breathe", str(src), str(tmp_path / "c"), "--chest-y", "0.3"])     # pixel 에 모양 값
    with pytest.raises(SystemExit):
        cli.main(["breathe", str(src), str(src), "--mode", "smooth"])   # 원본 위에 덮어쓰지 않는다
    with pytest.raises(SystemExit, match="start_cell"):
        cli.main(["breathe", str(src), str(tmp_path / "d"), "--start-cell", "3"])     # pixel 에 토막


def _raised(image: Image.Image, rows: int) -> Image.Image:
    """그림을 `rows` 행 위로 올린 칸 — 화면 아래 변에 닿은 몸통은 맨 아래 행을 이어 붙여 그대로 닿는다 (고개를 든 칸처럼
    콘텐츠가 위로 길어진다)."""
    a = np.asarray(image.convert("RGBA"))
    return Image.fromarray(np.concatenate([a[rows:], np.repeat(a[-1:], rows, axis=0)]), "RGBA")


def test_the_reference_is_the_frame_the_rows_anatomy_is_measured_on(tmp_path) -> None:
    """`--reference` 면 해부를 첫 칸 대신 그 칸에서 잰다 — 루프 세트의 첫 칸에서 재면 첫 칸이 다른(고개를 든) 토막도
    머리선·가슴·오르는 양이 루프의 것이다. 굽기는 그 한 벌로 굽고, 기록에 그 칸의 경로와 sha256 이 남는다."""
    from sprite_gen import cli

    base = _bust()
    frames = [_raised(base, 4), *[base] * 7]
    src = tmp_path / "piece"
    src.mkdir()
    for i, im in enumerate(frames):
        im.save(src / f"frame-{i:03d}.png")
    base.save(tmp_path / "base.png")
    flags = ["--mode", "smooth", "--depth", "0.025", "--breaths", "2", "--loop-cells", "24", "--start-cell", "9"]
    assert cli.main(["breathe", str(src), str(tmp_path / "own"), *flags]) == 0
    assert cli.main(["breathe", str(src), str(tmp_path / "out"), *flags, "--reference", str(tmp_path / "base.png")]) == 0
    own = json.loads((tmp_path / "own" / "breathe.json").read_text(encoding="utf-8"))
    report = json.loads((tmp_path / "out" / "breathe.json").read_text(encoding="utf-8"))
    assert report["resolved"]["anatomy"] == analyze(base).as_dict() != own["resolved"]["anatomy"]
    assert own["resolved"]["anatomy"]["height"] == report["resolved"]["anatomy"]["height"] + 4 and "reference" not in own
    assert report["reference"] == {"path": str(tmp_path / "base.png"),
                                   "sha256": hashlib.sha256((tmp_path / "base.png").read_bytes()).hexdigest()}
    expect, phases = B.bake_breathe_sequence(frames, _cfg(_smooth(loop_cells=24, start_cell=9)), analyze(base))
    assert report["phases"] == phases == own["phases"]
    for i, want in enumerate(expect):
        with Image.open(tmp_path / "out" / f"frame-{i:03d}.png") as im:
            assert im.convert("RGBA").tobytes() == want.tobytes(), f"{i}번 칸이 기준 칸의 해부로 구운 칸이 아니다"
    Image.new("RGBA", (base.width + 2, base.height)).save(tmp_path / "wide.png")
    with pytest.raises(SystemExit, match="--reference"):
        cli.main(["breathe", str(src), str(tmp_path / "wide"), *flags, "--reference", str(tmp_path / "wide.png")])
    with pytest.raises(SystemExit, match="--avoid-region"):
        cli.main(["breathe", str(src), str(tmp_path / "beat"), "--mode", "smooth", "--avoid-region", "0.3,0.7,0.7,0.9",
                  "--fps", "24", "--loop-cells", "24", "--start-cell", "9"])
    assert not any((tmp_path / name).exists() for name in ("wide", "beat"))
