# SPDX-License-Identifier: Apache-2.0
"""Breathe 레이어의 둥근 가슴 (pixel — `chest_round`·`arms_x`)과 고정 칸·쥔 물건 (`--hold-mask`·`--props-mask`).

pixel 봉투 스쿼시는 가로줄을 통째로 눌렀다 늘인다 — 머리가 몸통 위에서 오르내리고 숨이 줄 단위로 읽힌다. 둥근 가슴은
가슴 꼭대기 한 점에서 바깥으로 부풀었다 줄고, 팔은 옆으로 벌어졌다 모이고, 머리와 선 발은 그대로다. 도트 그림이라 출력의
칸은 모두 원본에 있던 칸이다.

지키는 것 (구현이 아니라 계약):
  1. 위상 0 인 칸은 원본과 바이트 같다 — 루프 이음이 안 바뀐다
  2. 머리(강체 경계 위)는 모든 칸에서 자리·바이트 그대로
  3. 가슴은 한 점에서 둥글게 부푼다: 가슴 가운데 줄이 옆으로 가장 많이 나가고 그 아래 줄은 덜, 꼭대기 위는 위로 오르고
     꼭대기 아래는 위아래로 안 간다 (발이 선다)
  4. 새 색 0, 칸 순서가 안 뒤집힌다(접힘 없음), 1 px 윤곽선이 1 px 로 남는다
  5. 팔(부속)은 옆으로 통째 밀린다 — 늘지 않는다
  6. 쥔 물건은 그쪽 팔과 같은 칸만큼 통째로 가고, 쥔 손과의 사이에 빈 칸이 한 칸도 안 생긴다
  7. 고정 칸은 모든 칸에서 그 칸의 바이트 그대로 (pixel 둥근 가슴과 smooth 둘 다)
  8. 키를 안 주거나 0 이면 이전과 바이트 같다, 범위 밖·섞으면 안 되는 키는 조용히 버리지 않고 거부한다
  9. 쥔 물건 조각의 칸은 모든 칸에서 장부가 맞는다 — 제자리에 그렸거나 앞의 것에 가려졌다(가려진 칸은 센다). 셀 밖으로 가는
     조각 칸, 한 층의 두 조각이 한 칸에 놓이는 것, 몸 뒤 조각과 몸이 떨어져 생기는 구멍은 거부한다. 떠난 자리로 늘어나 지어낸
     칸도 센다. 쥔 물건이 없으면 이 길을 타지 않아 바이트가 그대로다
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import re

import numpy as np
import pytest
from PIL import Image

from sprite_gen.curate.curation import state_breathe
from sprite_gen.effects import breathe as B
from sprite_gen.frames.extract import solid_alpha_bbox

FUR = (200, 140, 60, 255)
LINE = (40, 24, 16, 255)
HAND = (240, 210, 170, 255)
LEG = (170, 110, 50, 255)
HILT = (110, 70, 40, 255)
BLADE = (180, 190, 205, 255)
MARKS = ((255, 0, 0, 255), (0, 200, 0, 255), (0, 0, 255, 255))     # 몸통 안 세로 표시선 — 왼쪽, 가운데, 오른쪽
BAR = (255, 0, 255, 255)                                            # 가슴 위쪽 가로 표시선
LOW = (0, 255, 255, 255)                                            # 가슴 아래쪽 가로 표시선
W, H, AXIS = 150, 124, 75
TORSO = 19


def _figure() -> tuple[Image.Image, np.ndarray, np.ndarray]:
    """곰 대신 합성 몸 — 둥근 머리, 목, 어깨가 처진 몸통, 어깨에 붙어 늘어진 두 팔과 손, 두 다리, 1 px 윤곽선, 오른손에 붙은
    막대(칼). (그림, 고정 칸 = 다리, 쥔 물건 = 막대)."""
    yy, xx = np.mgrid[0:H, 0:W]
    dx = xx - AXIS
    head = ((dx + 0.5) / 15.0) ** 2 + ((yy + 0.5 - 24) / 14.0) ** 2 <= 1.0
    neck = (np.abs(dx) <= 6) & (yy >= 37) & (yy < 44)
    half = np.where(yy < 48, 13 + (yy - 42), TORSO)
    torso = (np.abs(dx) <= half) & (yy >= 42) & (yy < 90)
    shoulders = (np.abs(dx) <= 33) & (yy >= 48) & (yy < 53)
    arms = (np.abs(dx) >= 28) & (np.abs(dx) <= 33) & (yy >= 48) & (yy < 79)
    legs = (np.abs(dx) >= 4) & (np.abs(dx) <= 15) & (yy >= 88) & (yy < 113)
    body = head | neck | torso | shoulders | arms | legs
    inner = np.zeros_like(body)
    inner[1:-1, 1:-1] = body[1:-1, 1:-1] & body[:-2, 1:-1] & body[2:, 1:-1] & body[1:-1, :-2] & body[1:-1, 2:]
    a = np.zeros((H, W, 4), np.uint8)
    a[body] = FUR
    a[legs & inner] = LEG
    a[arms & (yy >= 74) & inner] = HAND
    for colour, x in zip(MARKS, (AXIS - 12, AXIS, AXIS + 12)):
        a[(xx == x) & (yy >= 50) & (yy < 86)] = colour
    a[(yy == 55) & (np.abs(dx) <= 14) & (xx != AXIS - 12) & (xx != AXIS) & (xx != AXIS + 12)] = BAR
    a[(yy == 74) & (np.abs(dx) <= 14) & (xx != AXIS - 12) & (xx != AXIS) & (xx != AXIS + 12)] = LOW
    a[body & ~inner] = LINE
    bar = (xx >= AXIS + 34) & (xx <= AXIS + 35) & (yy >= 66) & (yy < 105)
    a[bar] = BLADE
    a[bar & (yy >= 72) & (yy < 81)] = HILT
    hold = legs & (yy >= 90)
    return Image.fromarray(a, "RGBA"), hold, bar


def _cfg(**raw) -> dict:
    return state_breathe({"states": {"idle": {"breathe": {k: v for k, v in raw.items() if v is not None}}}}, "idle")


ROUND = dict(chest_round=0.025, breaths=1, torso_half=21)


def _bake(cfg: dict, count: int = 24, hold=None, props=None):
    src, _, _ = _figure()
    return src, *B.bake_breathe_sequence([src] * count, cfg, hold=hold, props=props)


def _peak(phases: list[float], inhale: float = 0.4) -> int:
    return min(range(len(phases)), key=lambda i: abs(phases[i] - inhale))


def _edges(a: np.ndarray, y: int) -> tuple[int, int]:
    xs = np.flatnonzero(a[y, :, 3] > 0)
    return int(xs[0]), int(xs[-1])


def _torso(a: np.ndarray, y: int) -> tuple[int, int]:
    """그 줄에서 몸통 축을 지나는 불투명 구간의 양 끝 — 팔과 사이가 떠 있어 팔은 안 센다."""
    left = right = AXIS
    while a[y, left - 1, 3] > 0:
        left -= 1
    while a[y, right + 1, 3] > 0:
        right += 1
    return left, right


def _row_of(a: np.ndarray, colour, x: int) -> float:
    ys = np.flatnonzero((a[:, x] == colour).all(-1))
    assert ys.size, f"표시선 {colour} 를 열 {x} 에서 못 찾았다"
    return float(ys.mean())


# ── 1·2. 쉼은 원본, 머리는 그대로 ────────────────────────────────────

def test_the_rest_is_the_source_and_the_head_never_moves() -> None:
    src, frames, phases = _bake(_cfg(**ROUND))
    anat = B.resolve_anatomy(src, _cfg(**ROUND))
    top = solid_alpha_bbox(src)[1] + anat.rigid_row
    base = np.asarray(src)
    assert frames[0].tobytes() == src.tobytes(), "위상 0 인 첫 칸이 원본과 다르다"
    assert any(f.tobytes() != src.tobytes() for f in frames), "숨을 한 번도 안 쉬었다"
    for i, f in enumerate(frames):
        assert np.array_equal(np.asarray(f)[:top], base[:top]), f"{i}번 칸: 강체 경계 위(머리)가 움직였다"


# ── 3. 한 점에서 둥글게 ──────────────────────────────────────────────

def test_the_chest_swells_round_from_one_point() -> None:
    cfg = _cfg(**ROUND)
    src, frames, phases = _bake(cfg)
    anat = B.resolve_anatomy(src, cfg)
    box = solid_alpha_bbox(src)
    px, py = B.smooth_chest_peak(anat, cfg)
    centre, ry = int(box[1] + py), B._chest_frame(anat, cfg)[3]
    base, peak = np.asarray(src), np.asarray(frames[_peak(phases)])
    l0, r0 = _torso(base, centre)
    l1, r1 = _torso(peak, centre)
    assert l0 - l1 >= 2 and r1 - r0 >= 2, f"가슴 가운데 줄이 옆으로 안 부풀었다: {l0},{r0} -> {l1},{r1}"
    assert abs((l0 - l1) - (r1 - r0)) <= 1, "가운데에서 부푼 가슴이 한쪽으로 쏠렸다"
    lower = int(centre + 0.8 * ry)
    u0, v0 = _torso(base, lower)
    u1, v1 = _torso(peak, lower)
    assert 0 < (v1 - v0) < (r1 - r0), (f"둥근 부풂이 아니다 — 가슴 아래쪽 줄({lower})이 가운데 줄({centre})보다 덜 나가야 "
                                        f"한다: 아래 {v1 - v0}, 가운데 {r1 - r0}")
    # 꼭대기 위는 오르고, 꼭대기 아래는 위아래로 안 간다 — 선 발을 누르지 않는다
    assert _row_of(base, BAR, AXIS + 4) - _row_of(peak, BAR, AXIS + 4) >= 1.0, "꼭대기 위 가로선이 안 올랐다"
    assert _row_of(peak, LOW, AXIS + 4) == _row_of(base, LOW, AXIS + 4), "꼭대기 아래 가로선이 위아래로 움직였다"
    # 꼭대기 자리는 제자리다 — 부풂의 가운데
    assert (peak[int(box[1] + py), AXIS] == base[int(box[1] + py), AXIS]).all()


def test_the_chest_comes_back_down_each_breath() -> None:
    _, frames, phases = _bake(_cfg(**{**ROUND, "breaths": 2}))
    rest = [i for i, p in enumerate(phases) if p == 0.0]
    assert rest == [0, 12]
    assert frames[12].tobytes() == frames[0].tobytes(), "둘째 숨이 쉼에서 시작하지 않는다"


# ── 4. 도트 그대로 ───────────────────────────────────────────────────

def test_the_round_chest_is_pixel_true() -> None:
    src, frames, _ = _bake(_cfg(**{**ROUND, "arms_x": 0.02}))
    base = np.asarray(src)
    palette = {tuple(c) for c in base.reshape(-1, 4)[base[..., 3].reshape(-1) > 0].tolist()}
    for i, f in enumerate(frames):
        a = np.asarray(f)
        colours = {tuple(c) for c in a.reshape(-1, 4)[a[..., 3].reshape(-1) > 0].tolist()}
        assert colours <= palette, f"{i}번 칸에 원본에 없는 색 {len(colours - palette)}개"
        assert set(np.unique(a[..., 3])) <= {0, 255}, f"{i}번 칸에 반투명 칸이 생겼다"
        # 접힘 없음 — 몸통 안 세 세로선이 모든 줄에서 왼쪽·가운데·오른쪽 순서 그대로, 한 칸 두께 그대로
        for y in range(50, 86):
            at = [np.flatnonzero((a[y] == c).all(-1)) for c in MARKS]
            if all(x.size for x in at):
                assert at[0].max() < at[1].min() and at[1].max() < at[2].min(), f"{i}번 칸 {y}줄: 칸 순서가 뒤집혔다"
        # 1 px 윤곽선 — 몸통 줄의 양 끝 칸은 윤곽선이고 그 안쪽 칸은 아니다
        for y in range(56, 66):                      # 팔 줄 — 66 줄부터는 줄 끝이 윤곽선 없는 막대다
            left, right = _edges(a, y)
            assert tuple(a[y, left]) == LINE and tuple(a[y, right]) == LINE, f"{i}번 칸 {y}줄: 윤곽선이 빠졌다"
            assert tuple(a[y, left + 1]) != LINE and tuple(a[y, right - 1]) != LINE, f"{i}번 칸 {y}줄: 윤곽선이 두 칸이다"


# ── 5. 팔은 옆으로 통째 ───────────────────────────────────────────────

def test_the_arms_move_sideways_whole() -> None:
    cfg = _cfg(arms_x=0.03, breaths=1, torso_half=21)
    src, frames, phases = _bake(cfg)
    base, peak = np.asarray(src), np.asarray(frames[_peak(phases)])
    for y in range(56, 72):
        for side, (lo, hi) in (("왼", (AXIS - 34, AXIS - 27)), ("오른", (AXIS + 27, AXIS + 34))):
            seg = base[y, lo:hi + 1]
            hits = [k for k in range(-5, 6) if np.array_equal(peak[y, lo + k:hi + 1 + k], seg)]
            assert hits, f"{y}줄 {side}팔이 통째로 옮겨지지 않았다 (늘었거나 찢겼다)"
            k = hits[0]
            assert (k < 0) if side == "왼" else (k > 0), f"{y}줄 {side}팔이 바깥으로 안 갔다: {k}"


# ── 6. 쥔 물건은 손과 한 덩이 ─────────────────────────────────────────

def test_a_held_bar_moves_with_the_hand_and_no_gap_opens() -> None:
    src, hold, bar = _figure()
    cfg = _cfg(**{**ROUND, "arms_x": 0.02})
    frames, phases = B.bake_breathe_sequence([src] * 24, cfg, hold=hold, props=bar)
    base = np.asarray(src)
    ys, xs = np.nonzero(bar)
    steps = []
    for i, f in enumerate(frames):
        a = np.asarray(f)
        found = [k for k in range(-5, 6) if np.array_equal(a[ys, xs + k], base[ys, xs])]
        assert found, f"{i}번 칸: 막대가 통째로 옮겨지지 않았다"
        k = found[0]
        steps.append(k)
        for y in range(74, 79):                       # 막대를 쥔 손 줄 — 손 바깥 윤곽선과 막대 사이에 빈 칸이 없다
            hand = np.flatnonzero((a[y, :AXIS + 34 + k] == LINE).all(-1))
            assert hand.size and hand.max() == AXIS + 33 + k, (
                f"{i}번 칸 {y}줄: 손이 막대와 같은 {k}칸을 안 갔다 (손 끝 {hand.max() if hand.size else None})")
    assert max(steps) >= 2, f"팔이 들숨에 막대를 바깥으로 안 옮겼다: {steps}"
    assert steps[0] == 0


# ── 7. 고정 칸 ───────────────────────────────────────────────────────

@pytest.mark.parametrize("cfg", [_cfg(**{**ROUND, "arms_x": 0.02}), _cfg(mode="smooth", depth=0.02, breaths=1)],
                         ids=["round", "smooth"])
def test_held_cells_keep_their_bytes_in_every_frame(cfg) -> None:
    src, hold, _ = _figure()
    frames, _ = B.bake_breathe_sequence([src] * 24, cfg, hold=hold)
    base = np.asarray(src)
    assert any(f.tobytes() != src.tobytes() for f in frames)
    for i, f in enumerate(frames):
        changed = int((np.asarray(f)[hold] != base[hold]).any(-1).sum())
        assert changed == 0, f"{i}번 칸: 고정 칸 {changed}개가 바뀌었다"


# ── 8. 기본은 그대로, 거부는 요란하게 ───────────────────────────────

def test_the_new_keys_off_keep_every_byte() -> None:
    plain = _cfg(depth=0.06, breaths=2, lag=0.1)
    off = _cfg(depth=0.06, breaths=2, lag=0.1, chest_round=0, arms_x=0)
    assert off == plain, "chest_round·arms_x 가 0 인 줄의 정규화가 키 없는 줄과 다르다"
    src, _, _ = _figure()
    a, _ = B.bake_breathe_sequence([src] * 12, plain)
    b, _ = B.bake_breathe_sequence([src] * 12, off)
    assert [f.tobytes() for f in a] == [f.tobytes() for f in b]


def test_a_round_row_reads_its_keys() -> None:
    cfg = _cfg(chest_round=0.05, arms_x=0.02, breath_peaks=[3, 9], inhale=0.5, chest_y=0.4)
    assert cfg["chest_round"] == 0.05 and cfg["arms_x"] == 0.02 and cfg["breath_peaks"] == [3, 9]
    assert cfg["breaths"] == 2 and cfg["inhale"] == 0.5 and cfg["chest_y"] == 0.4
    assert "depth" not in cfg and "lag" not in cfg and "shoulder" not in cfg
    assert B.pixel_round(cfg) and B.breathe_mode(cfg) == "pixel"


@pytest.mark.parametrize("raw,match", [
    ({"chest_round": 0.3}, "chest_round"),
    ({"arms_x": -0.01}, "arms_x"),
    ({"chest_round": "a"}, "chest_round"),
    ({"chest_round": 0.04, "depth": 0.06}, "depth"),
    ({"chest_round": 0.04, "lag": 0.1}, "lag"),
    ({"arms_x": 0.03, "shoulder": 0.5}, "shoulder"),
    ({"chest_round": 0.04, "chest_flat": 0.2}, "chest_flat"),
    ({"mode": "smooth", "chest_round": 0.04}, "chest_round"),
    ({"chest_y": 0.4}, "smooth"),
])
def test_wrong_round_keys_are_refused(raw, match) -> None:
    with pytest.raises(SystemExit, match=match):
        _cfg(**raw)


@pytest.mark.parametrize("masked", [False, True], ids=["bare", "with-hold"])
@pytest.mark.parametrize("cfg", [_cfg(chest_round=0.2, breaths=1, torso_half=21), _cfg(mode="smooth", depth=0.2, breaths=1)],
                         ids=["round", "smooth"])
def test_a_strain_past_the_cap_is_refused_with_or_without_held_cells(cfg, masked) -> None:
    """고정 칸을 줘도 몸의 장이 행당 상한을 넘으면 거부는 그대로다 — 재지 않고 빼는 건 고정 칸·쥔 물건 칸과 그 이웃뿐이다."""
    src, hold, _ = _figure()
    with pytest.raises(SystemExit, match="상한"):
        B.bake_breathe_sequence([src] * 4, cfg, hold=hold if masked else None)


def test_masks_need_a_field_bake_and_props_need_arms() -> None:
    src, hold, bar = _figure()
    with pytest.raises(SystemExit, match="hold-mask"):
        B.bake_breathe_sequence([src] * 4, _cfg(depth=0.06, breaths=1), hold=hold)
    with pytest.raises(SystemExit, match="arms_x"):
        B.bake_breathe_sequence([src] * 4, _cfg(**ROUND), props=bar)
    with pytest.raises(SystemExit, match="고정 칸이면서"):
        B.bake_breathe_sequence([src] * 4, _cfg(**{**ROUND, "arms_x": 0.02}), hold=hold | bar, props=bar)
    with pytest.raises(SystemExit, match="크기"):
        B.bake_breathe_sequence([src] * 4, _cfg(**ROUND), hold=hold[:-1])


# ── CLI: 같은 값, 같은 굽기 ─────────────────────────────────────────

def test_the_cli_bakes_what_the_library_bakes(tmp_path) -> None:
    from sprite_gen import cli

    src, hold, bar = _figure()
    loop = tmp_path / "loop"
    loop.mkdir()
    for i in range(12):
        src.save(loop / f"frame-{i:03d}.png")
    masks = {}
    for name, m in (("hold", hold), ("props", bar)):
        masks[name] = tmp_path / f"{name}.png"
        Image.fromarray(np.where(m, 255, 0).astype(np.uint8), "L").save(masks[name])
    out = tmp_path / "out"
    assert cli.main(["breathe", str(loop), str(out), "--chest-round", "0.025", "--arms-x", "0.02", "--breaths", "1", "--torso-half", "21",
                     "--hold-mask", str(masks["hold"]), "--props-mask", str(masks["props"])]) == 0
    cfg = _cfg(chest_round=0.025, arms_x=0.02, breaths=1, torso_half=21)
    want, phases = B.bake_breathe_sequence([src] * 12, cfg, hold=hold, props=bar)
    for i, frame in enumerate(want):
        with Image.open(out / f"frame-{i:03d}.png") as im:
            assert im.convert("RGBA").tobytes() == frame.tobytes(), f"{i}번 칸이 라이브러리 굽기와 다르다"
    report = json.loads((out / "breathe.json").read_text(encoding="utf-8"))
    assert report["config"] == json.loads(json.dumps(cfg)) and report["phases"] == phases
    assert report["hold"]["cells"] == int(hold.sum()) and len(report["hold"]["sha256"]) == 64
    assert report["props"]["cells"] == int(bar.sum())
    assert [p["cells"] for p in report["props"]["pieces"]] == [int(bar.sum())]
    assert report["props"]["pieces"][0]["shift_px"] > 0, "오른쪽 막대가 바깥(오른쪽)으로 가지 않는다"


# ── 9. 고정 칸 밑으로 가는 쥔 물건: 세고, 경고하고, 떠난 자리는 고정 칸이 채운다 ─────────────

WATER = (90, 180, 170, 255)
GLINT = (225, 225, 235, 255)
RIM = (120, 120, 130, 255)
PLANK = (150, 100, 60, 255)


def _wet_figure() -> tuple[Image.Image, np.ndarray, np.ndarray]:
    """막대(칼)의 아래 끝이 물 띠에 잠긴 몸 — 물 띠는 막대 양옆에 붙은 고정 칸이다. 막대가 들숨에 바깥(오른쪽)으로 가면 오른쪽
    물 밑으로 들어가고, 왼쪽에 떠난 칸이 생긴다. (그림, 고정 칸 = 다리와 물, 쥔 물건 = 막대)."""
    src, legs, bar = _figure()
    a = np.asarray(src).copy()
    yy, xx = np.mgrid[0:H, 0:W]
    water = (yy >= 96) & (yy < 105) & (((xx >= AXIS + 28) & (xx < AXIS + 34)) | ((xx >= AXIS + 36) & (xx < AXIS + 45)))
    a[water] = WATER
    return Image.fromarray(a, "RGBA"), legs | water, bar


def _bar_step(a: np.ndarray, base: np.ndarray, bar: np.ndarray) -> int:
    """막대가 옮겨진 칸 — 물 위의 막대 칸이 통째로 맞는 가로 칸."""
    ys, xs = np.nonzero(bar & (np.arange(H)[:, None] < 96))
    found = [k for k in range(-5, 6) if np.array_equal(a[ys, xs + k], base[ys, xs])]
    assert found, "막대가 통째로 옮겨지지 않았다"
    return found[0]


def test_a_prop_going_under_held_cells_is_counted_warned_and_leaves_no_gap(tmp_path, capsys) -> None:
    from sprite_gen import cli

    src, hold, bar = _wet_figure()
    loop = tmp_path / "loop"
    loop.mkdir()
    for i in range(24):
        src.save(loop / f"frame-{i:03d}.png")
    masks = {}
    for name, m in (("hold", hold), ("props", bar)):
        masks[name] = tmp_path / f"{name}.png"
        Image.fromarray(np.where(m, 255, 0).astype(np.uint8), "L").save(masks[name])
    out = tmp_path / "out"
    assert cli.main(["breathe", str(loop), str(out), "--chest-round", "0.025", "--arms-x", "0.02", "--breaths", "1",
                     "--torso-half", "21", "--hold-mask", str(masks["hold"]), "--props-mask", str(masks["props"])]) == 0
    base = np.asarray(src)
    report = json.loads((out / "breathe.json").read_text(encoding="utf-8"))
    piece = report["props"]["pieces"][0]
    want = []
    for i in range(24):
        with Image.open(out / f"frame-{i:03d}.png") as im:
            a = np.asarray(im.convert("RGBA"))
        assert np.array_equal(a[hold], base[hold]), f"{i}번 칸: 고정 칸이 바뀌었다 (쥔 물건이 고정 칸 위에 그려졌다)"
        k = _bar_step(a, base, bar)
        ys, xs = np.nonzero(bar)
        want.append(int(np.count_nonzero(hold[ys, xs + k])))
        if k > 0:                                     # 물에 잠긴 줄에서 막대가 떠난 칸은 바로 뒤의 물이 채운다 — 빈 칸 없음
            for y in range(96, 105):
                left = a[y, AXIS + 34:AXIS + 34 + k]
                assert (left == WATER).all(), f"{i}번 칸 {y}줄: 막대가 떠난 자리가 물이 아니다 (틈)"
    assert max(want) > 0, "막대가 물 밑으로 한 번도 안 들어갔다 — 시험이 반례를 못 만든다"
    assert piece["hidden"] == want, "breathe.json 의 칸마다 가려진 칸 수가 물 밑으로 들어간 막대 칸 수와 다르다"
    assert piece["hidden_max"] == max(want)
    err = capsys.readouterr().err
    assert "breathe: warning: --props-mask piece 1 of 1" in err and f"up to {max(want)} cells" in err, err


# ── 10. 손에 안 닿은 반사는 색으로 묶으면 칼과 같은 칸만큼 간다 ─────────────────────────────

def _reflected_figure() -> tuple[Image.Image, np.ndarray, np.ndarray, np.ndarray]:
    """막대 아래 물 띠에 막대의 반사(손에 안 닿은 따로 조각)가 비친 몸. (그림, 고정 칸 = 다리와 반사가 갈 자리 밖의 물, 막대,
    반사)."""
    src, legs, bar = _figure()
    a = np.asarray(src).copy()
    yy, xx = np.mgrid[0:H, 0:W]
    water = (yy >= 109) & (yy < 116) & (xx >= AXIS + 22) & (xx < AXIS + 48)
    glint = (yy >= 110) & (yy < 113) & (xx >= AXIS + 34) & (xx < AXIS + 37)
    zone = (yy >= 110) & (yy < 113) & (xx >= AXIS + 37) & (xx < AXIS + 41)   # 반사가 갈 물 — 고정에서 뺀다
    a[water] = WATER
    a[glint] = GLINT
    return Image.fromarray(a, "RGBA"), legs | (water & ~glint & ~zone), bar, glint


def test_a_reflection_painted_the_swords_colour_follows_the_sword(tmp_path) -> None:
    """물 띠 안의 반사(손에 안 닿은 따로 조각)를 막대와 같은 색으로 칠하고 --props-groups colour 로 굽는다 — 모든 칸에서 반사가
    막대와 같은 칸만큼 가고, 반사가 떠난 자리는 정지 그림의 물이고, 새 색이 없다."""
    from sprite_gen import cli

    src, hold, bar, glint = _reflected_figure()
    loop = tmp_path / "loop"
    loop.mkdir()
    for i in range(24):
        src.save(loop / f"frame-{i:03d}.png")
    paint = np.zeros((H, W, 3), np.uint8)
    paint[bar | glint] = (255, 255, 0)                # 막대와 반사는 한 색, 한 무리
    Image.fromarray(paint, "RGB").save(tmp_path / "props.png")
    Image.fromarray(np.where(hold, 255, 0).astype(np.uint8), "L").save(tmp_path / "hold.png")
    out = tmp_path / "out"
    assert cli.main(["breathe", str(loop), str(out), "--chest-round", "0.025", "--arms-x", "0.02", "--breaths", "1",
                     "--torso-half", "21", "--hold-mask", str(tmp_path / "hold.png"), "--props-mask",
                     str(tmp_path / "props.png"), "--props-groups", "colour"]) == 0
    base = np.asarray(src)
    palette = {tuple(c) for c in base.reshape(-1, 4)[base[..., 3].reshape(-1) > 0].tolist()}
    report = json.loads((out / "breathe.json").read_text(encoding="utf-8"))
    pieces = report["props"]["pieces"]
    assert report["props"]["groups"] == "colour" and len(pieces) == 2
    assert {p["colour"] for p in pieces} == {"#ffff00"} and pieces[0]["shift_px"] == pieces[1]["shift_px"]
    gy, gx = np.nonzero(glint)
    steps = []
    for i in range(24):
        with Image.open(out / f"frame-{i:03d}.png") as im:
            f = np.asarray(im.convert("RGBA"))
        k = _bar_step(f, base, bar)
        steps.append(k)
        assert np.array_equal(f[gy, gx + k], base[gy, gx]), f"{i}번 칸: 반사가 막대와 같은 {k}칸을 안 갔다"
        left = glint & ~np.roll(glint, k, axis=1) if k else np.zeros_like(glint)
        assert (f[left] == WATER).all(), f"{i}번 칸: 반사가 떠난 자리가 정지 그림의 물이 아니다"
        assert np.array_equal(f[hold], base[hold]), f"{i}번 칸: 고정 칸이 바뀌었다"
        colours = {tuple(c) for c in f.reshape(-1, 4)[f[..., 3].reshape(-1) > 0].tolist()}
        assert colours <= palette, f"{i}번 칸에 원본에 없는 색"
    assert max(steps) >= 2, f"막대와 반사가 들숨에 바깥으로 안 갔다: {steps}"


# ── 11. 몸 뒤 물건(등에 건 방패)은 몸 뒤에서 빠져나오고, 그 자리는 방패의 나머지다 ──────────

def _shielded_figure() -> tuple[Image.Image, np.ndarray, np.ndarray]:
    """고정된 왼팔 뒤에 방패가 걸린 몸 — 방패가 팔 뒤로 들어가는 열은 테두리 색. (그림, 고정 칸 = 다리와 왼팔, 방패)."""
    src, legs, _ = _figure()
    a = np.asarray(src).copy()
    yy, xx = np.mgrid[0:H, 0:W]
    arm = (xx >= AXIS - 33) & (xx <= AXIS - 28) & (yy >= 48) & (yy < 79)
    shield = (xx >= AXIS - 41) & (xx < AXIS - 33) & (yy >= 58) & (yy < 73)
    a[shield] = PLANK
    a[shield & (xx == AXIS - 34)] = RIM               # 방패가 팔 뒤로 들어가는 테두리
    return Image.fromarray(a, "RGBA"), legs | arm, shield


def test_a_shield_behind_the_body_slides_out_from_behind_it() -> None:
    """방패가 고정된 왼팔 뒤에 걸려 있다. 몸 뒤 물건으로 주면 들숨에 바깥(왼쪽)으로 빠져나오며, 팔과 방패 사이는 방패가 팔에
    닿았던 칸(테두리)이 채운다 — 빈 칸도, 팔의 윤곽이 두꺼워지는 것도 없다. 몸 앞 물건으로 주면 그 자리는 고정된 팔의 윤곽이
    늘어난다 (몸 앞 물건이 떠난 자리에는 그 뒤의 것이 나온다)."""
    src, hold, shield = _shielded_figure()
    cfg = _cfg(**{**ROUND, "arms_x": 0.02})
    base = np.asarray(src)
    behind, _ = B.bake_breathe_sequence([src] * 24, cfg, hold=hold, behind=shield)
    front, _ = B.bake_breathe_sequence([src] * 24, cfg, hold=hold, props=shield)
    ys, xs = np.nonzero(shield)
    moved = 0
    for i, (f, g) in enumerate(zip(behind, front)):
        f, g = np.asarray(f), np.asarray(g)
        assert np.array_equal(f[hold], base[hold]), f"{i}번 칸: 고정된 팔이 바뀌었다"
        found = [k for k in range(-5, 1) if np.array_equal(f[ys, xs + k], base[ys, xs])]
        assert found, f"{i}번 칸: 방패가 통째로 옮겨지지 않았다"
        k = found[0]
        if k:
            moved += 1
            gap = f[58:73, AXIS - 34 + k + 1:AXIS - 33]
            assert (gap == RIM).all(), f"{i}번 칸: 방패가 빠져나온 자리가 방패 테두리가 아니다 (틈이거나 팔 윤곽)"
            assert (np.asarray(g)[58:73, AXIS - 34 + k + 1:AXIS - 33] == LINE).all(), \
                f"{i}번 칸: 몸 앞 물건이 떠난 자리를 고정된 팔 윤곽이 채우지 않았다"
    assert moved, "방패가 한 번도 안 움직였다"


def test_props_groups_without_a_props_mask_is_refused(tmp_path) -> None:
    from sprite_gen import cli

    src, _, _ = _figure()
    loop = tmp_path / "loop"
    loop.mkdir()
    src.save(loop / "frame-000.png")
    with pytest.raises(SystemExit, match="props-groups"):
        cli.main(["breathe", str(loop), str(tmp_path / "out"), "--chest-round", "0.025", "--arms-x", "0.02",
                  "--torso-half", "21", "--props-groups", "colour"])


# ── 12. 조각 장부: 셀 밖·한 칸 겹침·몸 뒤 구멍은 거부, 가려진 칸·지어낸 칸은 세고, 모든 칸에서 장부가 맞는다 ─────────────

INK = (37, 99, 203, 255)
HELD = _cfg(**{**ROUND, "arms_x": 0.02})
INHALE = B._shape(HELD)["inhale"]                       # 들숨 꼭대기의 위상 — 곡선이 1 이다


def _with_piece(rows: slice, cols: slice) -> tuple[Image.Image, np.ndarray, np.ndarray]:
    """`_figure` 에 몸과 떨어진 네모 조각 하나를 칠한 그림. (그림, 고정 칸 = 다리, 조각)."""
    src, legs, _ = _figure()
    a = np.asarray(src).copy()
    piece = np.zeros(legs.shape, bool)
    piece[rows, cols] = True
    a[piece] = INK
    return Image.fromarray(a, "RGBA"), legs, piece


def _scene(name: str) -> tuple[Image.Image, np.ndarray | None, np.ndarray | None, np.ndarray | None]:
    """장부 시험의 장면 — (그림, 고정 칸, 쥔 물건, 몸 뒤 물건). 쥔 물건은 bool 이거나 무리 번호 격자(색으로 묶은 것)다."""
    src, legs, bar = _figure()
    if name == "round":
        return src, None, None, None
    if name == "held legs":
        return src, legs, None, None
    if name == "bar":
        return src, legs, bar, None
    if name == "wet bar":
        return (*_wet_figure(), None)
    if name == "reflection":
        reflected, hold, bar, glint = _reflected_figure()
        return reflected, hold, np.where(bar | glint, 0xFFFF00 + 1, 0), None
    if name in ("shield behind", "shield in front"):
        shielded, hold, shield = _shielded_figure()
        return (shielded, hold, None, shield) if name == "shield behind" else (shielded, hold, shield, None)
    if name == "above the head line":                  # 몸이 조각을 따라가는 몫이 꺼진 행 — 장은 조각을 안 옮긴다
        return (*_with_piece(slice(20, 25), slice(30, 34)), None)
    if name == "across the head line":                 # 그 몫이 켜지는 행에 걸친 조각
        return (*_with_piece(slice(30, 60), slice(24, 27)), None)
    if name == "behind off the body":                  # 몸에 안 닿은 몸 뒤 조각 — 떠난 칸 뒤가 비어 빈 칸이 된다
        piece_src, legs, piece = _with_piece(slice(110, 113), slice(10, 13))
        return piece_src, legs, None, piece
    raise KeyError(name)


def _traced(src: Image.Image, cfg: dict, phase: float, anat, pins) -> np.ndarray:
    """출처 꼬리표 — 칸마다 제 번호를 RGB 에 실은 그림을 같은 해부·핀으로 구워, 출력 칸마다 그 칸이 보이는 원본 칸 번호를 읽는다
    (-1 = 빈 칸). 엔진의 장부와 따로 세는 판정이다: 굽기의 결정은 알파와 마스크에만 달려 꼬리표 그림도 같은 길로 굽힌다."""
    a = np.asarray(src.convert("RGBA"))
    h, w = a.shape[:2]
    ids = np.arange(1, h * w + 1).reshape(h, w)
    tag = Image.fromarray(np.stack([(ids >> 16) & 255, (ids >> 8) & 255, ids & 255, a[..., 3]], -1).astype(np.uint8), "RGBA")
    out = np.asarray(B._bake_phase(tag, cfg, phase, anat, pins)).astype(np.int64)
    code = (out[..., 0] << 16) | (out[..., 1] << 8) | out[..., 2]
    return np.where((code > 0) & (out[..., 3] > 0), code - 1, -1)


def _counted(src: Image.Image, seen: np.ndarray, pins, curve: float) -> list[tuple[int, int, int]]:
    """출처에서 센 조각마다 (불투명 칸 수, 제 목적지에 그대로 보이는 칸, 지어낸 칸). 지어낸 칸 = 제 칸이 제 목적지(제 칸 + 옮긴
    칸)가 아닌 자리에 보이는 칸 + 조각이 떠난 칸에 보이는 다른 자리의 고정 칸."""
    a = np.asarray(src.convert("RGBA"))
    h, w = a.shape[:2]
    opaque = a[..., 3] > 0
    yy, xx = np.mgrid[0:h, 0:w]
    sy, sx = np.where(seen >= 0, seen // w, -1), np.where(seen >= 0, seen % w, -1)
    label = np.where(seen >= 0, np.where(opaque, pins.props, 0)[np.maximum(sy, 0), np.maximum(sx, 0)], 0)
    held = (seen >= 0) & pins.hold[np.maximum(sy, 0), np.maximum(sx, 0)]
    rows = []
    for k in range(1, len(pins.shifts)):
        step = B.piece_step(pins, k, curve)
        ys, xs = np.nonzero((pins.props == k) & opaque)
        drawn = int(np.count_nonzero(seen[ys, xs + step] == ys * w + xs))
        left = (pins.props == k) & opaque
        left[ys, xs + step] = False
        made = int(np.count_nonzero((label == k) & ~((sy == yy) & (sx + step == xx)))) + int(np.count_nonzero(left & held))
        rows.append((int(ys.size), drawn, made))
    return rows


@pytest.mark.parametrize("layer", ["--props-behind-mask", "--props-mask"])
def test_a_piece_pushed_off_the_canvas_is_refused_not_cut(tmp_path, layer) -> None:
    """체크포인트 반례 — 몸과 떨어진 3x3 조각이 캔버스 왼쪽 변에 붙어 있고 들숨에 왼쪽으로 한 칸 간다. 몸 뒤 조각이든 몸 앞
    조각이든 조각의 이름과 넘어간 변·칸 수를 밝혀 거부한다: 자르고 굽지 않으며(몸 뒤 조각은 장에서 빠져 장의 셀 밖 검사를
    지나쳤다), 몸이 민 것으로 말하지 않는다(몸 앞 조각). 아무 폴더도 만들지 않는다."""
    from sprite_gen import cli

    src, legs, piece = _with_piece(slice(110, 113), slice(0, 3))
    loop = tmp_path / "loop"
    loop.mkdir()
    for i in range(3):
        src.save(loop / f"{i:03d}.png")
    Image.fromarray(np.where(legs, 255, 0).astype(np.uint8), "L").save(tmp_path / "hold.png")
    Image.fromarray(np.where(piece, 255, 0).astype(np.uint8), "L").save(tmp_path / "piece.png")
    out = tmp_path / "out"
    with pytest.raises(SystemExit) as err:
        cli.main(["breathe", str(loop), str(out), "--chest-round", "0.0001", "--arms-x", "0.02", "--breaths", "1",
                  "--loop-cells", "24", "--start-cell", "9", "--torso-half", "21", "--hold-mask", str(tmp_path / "hold.png"),
                  layer, str(tmp_path / "piece.png")])
    message = str(err.value)
    assert f"{layer} 조각 1/1(9칸)이 불투명 칸 3개를 셀 밖으로 민다 — 왼쪽 변 밖 3 (셀 150x124, 조각 -1칸)" in message, message
    assert not out.exists(), "거부한 굽기가 폴더를 남겼다"


def test_a_piece_above_the_head_line_pushed_off_the_canvas_is_refused() -> None:
    """머리선 위는 몸이 조각을 따라가는 몫이 꺼진 행이라 장이 조각을 안 옮긴다 — 장의 셀 밖 검사로는 조각이 안 보인다. 조각은
    제 칸만큼 통째로 가니 그 목적지로 본다."""
    src, legs, piece = _with_piece(slice(20, 23), slice(0, 3))
    with pytest.raises(SystemExit) as err:
        B.bake_breathe_sequence([src] * 24, HELD, hold=legs, props=piece)
    assert "--props-mask 조각 1/1(9칸)이 불투명 칸 3개를 셀 밖으로 민다 — 왼쪽 변 밖 3" in str(err.value), str(err.value)


def test_the_body_pushed_off_the_canvas_names_the_side() -> None:
    """오른팔 바깥 윤곽이 캔버스 오른쪽 변인 그림 — 팔이 옆으로 밀려 셀 밖으로 나가면 넘어간 변과 칸 수를 밝혀 거부한다 (pixel
    봉투의 거부와 같은 "오른쪽 변 밖 N" 꼴)."""
    src, _, _ = _figure()
    edge = Image.fromarray(np.asarray(src)[:, :AXIS + 34].copy(), "RGBA")
    with pytest.raises(SystemExit) as err:
        B.bake_breathe_sequence([edge] * 24, HELD)
    message = str(err.value)
    assert re.search(r"가슴·팔이 불투명 픽셀 (\d+)개를 셀 밖으로 민다 — 오른쪽 변 밖 \1 \(셀 109x124", message), message


@pytest.mark.parametrize("scene,layer,key", [("shield behind", "--props-behind-mask", "props_behind"),
                                             ("wet bar", "--props-mask", "props")])
def test_cells_a_piece_fills_are_recorded_and_warned(tmp_path, capsys, scene, layer, key) -> None:
    """떠난 자리로 늘어나 지어낸 칸 — 몸 뒤에서 빠져나오는 방패의 늘어난 테두리, 물에 잠겼던 막대가 떠난 자리의 물 — 은 옮긴
    칸이 아니다. breathe.json 의 조각마다 칸마다 `filled` 와 그 최대 `filled_max` 로 싣고, 경고 줄로 밝힌다. 수는 출처 꼬리표로
    따로 센 것과 같다."""
    from sprite_gen import cli

    src, hold, props, behind = _scene(scene)
    piece = behind if behind is not None else props
    loop = tmp_path / "loop"
    loop.mkdir()
    for i in range(24):
        src.save(loop / f"frame-{i:03d}.png")
    Image.fromarray(np.where(hold, 255, 0).astype(np.uint8), "L").save(tmp_path / "hold.png")
    Image.fromarray(np.where(piece, 255, 0).astype(np.uint8), "L").save(tmp_path / "piece.png")
    out = tmp_path / "out"
    assert cli.main(["breathe", str(loop), str(out), "--chest-round", "0.025", "--arms-x", "0.02", "--breaths", "1",
                     "--torso-half", "21", "--hold-mask", str(tmp_path / "hold.png"), layer, str(tmp_path / "piece.png")]) == 0
    anat = B.resolve_anatomy(src, HELD)
    pins = B.row_pins(anat, HELD, src, hold, props, behind)
    want = [_counted(src, _traced(src, HELD, phase, anat, pins), pins, B.smooth_wave(phase, INHALE))[0][2]
            for phase in B.fit_breathe_pattern(24, HELD)]
    piece_record = json.loads((out / "breathe.json").read_text(encoding="utf-8"))[key]["pieces"][0]
    assert max(want) > 0, "조각이 떠난 자리로 늘어난 칸이 없다 — 시험이 반례를 못 만든다"
    assert piece_record["filled"] == want and piece_record["filled_max"] == max(want), piece_record
    err = capsys.readouterr().err
    assert (f"breathe: warning: {layer} piece 1 of 1 ({piece_record['cells']} cells) leaves cells it fills by repeating a cell"
            in err and f"up to {max(want)} cells" in err and f"breathe.json {key}.pieces[0].filled" in err), err


@pytest.mark.parametrize("scene", ["bar", "wet bar", "reflection", "shield behind", "shield in front", "above the head line",
                                   "across the head line", "behind off the body"])
def test_every_cell_of_every_piece_is_drawn_or_counted(scene) -> None:
    """출처 꼬리표로 따로 센 장부 — 모든 칸에서 조각마다 제 목적지에 그대로 보이는 칸과 엔진이 센 가려진 칸의 합이 조각의 불투명
    칸 수이고, 엔진이 센 지어낸 칸이 출처로 센 것과 같다. 머리선 근처의 몸 앞 조각(장이 조각을 다 못 따라가 사본을 남기는 행)도,
    몸 뒤 조각도 같다."""
    src, hold, props, behind = _scene(scene)
    record = {}
    B.bake_breathe_sequence([src] * 24, HELD, hold=hold, props=props, behind=behind, record=record)
    anat = B.resolve_anatomy(src, HELD)
    pins = record["pins"]
    for i, phase in enumerate(B.fit_breathe_pattern(24, HELD)):
        counted = _counted(src, _traced(src, HELD, phase, anat, pins), pins, B.smooth_wave(phase, INHALE))
        for k, (cells, drawn, made) in enumerate(counted):
            assert drawn + record["hidden"][i][k] == cells, (
                f"{i}번 칸 조각 {k + 1}: 제자리 {drawn} + 가려짐 {record['hidden'][i][k]} != 칸 {cells}")
            assert record["filled"][i][k] == made, f"{i}번 칸 조각 {k + 1}: 엔진의 지어낸 칸 {record['filled'][i][k]} != {made}"


def _peak_pins(scene_src: Image.Image, hold, props, behind, shifts: list[float]):
    """들숨 꼭대기(위상 inhale, 곡선 1)에서 조각마다 원하는 칸만큼 가도록 핀의 가로 px 만 바꾼 (해부, 핀)."""
    anat = B.resolve_anatomy(scene_src, HELD)
    pins = B.row_pins(anat, HELD, scene_src, hold, props, behind)
    return anat, dataclasses.replace(pins, shifts=np.asarray([0.0] + shifts))


def _two_bars(second_behind: bool) -> tuple[Image.Image, np.ndarray, np.ndarray, np.ndarray | None]:
    """손에 쥔 막대 오른쪽에 붙은 두 번째 막대. 둘 다 몸 앞이면 색으로 묶은 두 무리(한 칸도 안 떨어져 있다), 두 번째가 몸 뒤면
    마스크가 둘이다. (그림, 다리, 쥔 물건, 몸 뒤 물건)."""
    src, legs, bar = _figure()
    a = np.asarray(src).copy()
    second = np.zeros_like(bar)
    second[66:105, AXIS + 36:AXIS + 38] = True
    a[second] = HILT
    if second_behind:
        return Image.fromarray(a, "RGBA"), legs, bar, second
    return Image.fromarray(a, "RGBA"), legs, np.where(bar, 0xFFFF00 + 1, 0) + np.where(second, 0x00FFFF + 1, 0), None


def test_two_pieces_of_one_layer_landing_on_one_cell_are_refused() -> None:
    """한 층의 두 조각이 옮겨진 뒤 한 칸에 놓이면 어느 쪽이 앞인지 마스크가 말하지 않는다 — 나중 조각이 앞 조각을 조용히 덮지
    않고 거부한다. 손에 쥔 막대가 세 칸 가고 바로 옆의 다른 무리는 제자리다."""
    src, legs, props, _ = _two_bars(second_behind=False)
    anat, pins = _peak_pins(src, legs, props, None, [3.0, 0.0])
    with pytest.raises(SystemExit) as err:
        B._bake_phase_pieces(src, HELD, INHALE, anat, pins)
    assert "--props-mask 의 두 조각(1/2, 2/2)이 옮겨진 뒤 39칸에 함께 놓인다" in str(err.value), str(err.value)


@pytest.mark.parametrize("shifts", [[3.0, 0.0], [0.0, -3.0]], ids=["front-moves-over", "behind-moves-under"])
def test_a_piece_in_front_stays_over_a_piece_behind(shifts) -> None:
    """몸 앞 조각은 늘 몸 뒤 조각 위다 — 몸 앞 막대가 몸 뒤 막대 위로 가도, 몸 뒤 막대가 제자리의 몸 앞 막대 밑으로 와도 몸 앞
    막대의 칸이 모두 보이고, 몸 앞 막대에 가린 몸 뒤 막대의 칸은 그 막대의 가려진 칸으로 센다."""
    src, legs, props, behind = _two_bars(second_behind=True)
    anat, pins = _peak_pins(src, legs, props, behind, shifts)
    baked = B._bake_phase_pieces(src, HELD, INHALE, anat, pins)
    frame, hidden = baked[0], baked[1]
    a, base = np.asarray(frame), np.asarray(src)
    ys, xs = np.nonzero(props)
    step = int(shifts[0])
    assert np.array_equal(a[ys, xs + step], base[ys, xs]), "몸 앞 막대가 몸 뒤 막대에 덮였다"
    assert hidden[0] == 0
    by, bx = np.nonzero(behind)
    under_front = int(np.count_nonzero(props[by, bx + int(shifts[1]) - step]))
    assert under_front == 39 and hidden[1] >= under_front, f"몸 앞 막대에 가린 몸 뒤 막대 칸 {under_front} 이 가려진 칸 {hidden[1]} 에 없다"


@pytest.mark.parametrize("cols,cells", [(slice(AXIS - 10, AXIS + 9), 171), (slice(AXIS - 16, AXIS - 6), 90)],
                         ids=["across-the-axis", "one-side"])
def test_a_piece_behind_the_body_moving_apart_from_it_is_refused(cols, cells) -> None:
    """몸통 안에 그려진 몸 뒤 조각 — 장은 그 앞의 몸을 몸의 장대로(축에 걸치면 양쪽으로 벌려) 옮기고 조각은 제 칸만큼 통째로
    가서, 둘 사이 정지 그림의 불투명 칸이 몸도 조각도 없이 빈다. 조용히 구멍을 내지 않고 거부한다."""
    src, legs, piece = _with_piece(slice(58, 67), cols)
    with pytest.raises(SystemExit) as err:
        B.bake_breathe_sequence([src] * 24, HELD, hold=legs, behind=piece)
    assert f"--props-behind-mask 조각 1/1({cells}칸)과 그 앞의 몸이 따로 움직여, 정지 그림에서 불투명하던 칸" in str(err.value), \
        str(err.value)


# 장부 앞(0787e37)에 구운 장면의 바이트 — 24칸을 이어 붙인 sha256. 출처 지도와 장부는 그리는 것을 바꾸지 않는다.
KEPT_BYTES = {
    "round": "b030ffd37acbd7c7966d121d61bb100541003720f1ea8daeedc1d4b94691fb16",
    "held legs": "39637a681597e51853aafba8fce2e2413db6d758d259c6085c561edbf1953e09",
    "bar": "a22ec4fa6d837a1f7363c68ab8dd3ea8ce3d7ea0d7a02529cf39b5a63054c077",
    "wet bar": "1f1c89d3b59004a15bdf4f0a0f3973f018c5b6eb53e8371119fab2063fce474a",
    "reflection": "1483e22d8484bedf0cd79edb5b248c7343593b1ab0c4c235d6a5e2e2dbab93e9",
    "shield behind": "f3d6e426890ebade2fa32152199610c4e413ed37fd9564d9459df3114ab223b0",
    "shield in front": "f0f755153c74be580314b8fd69efd5b347d81f0f734de54092bc031a87a74d5b",
}


@pytest.mark.parametrize("scene", sorted(KEPT_BYTES))
def test_the_ledger_changes_no_byte_of_what_it_counts(scene) -> None:
    """마스크 없는 둥근 가슴, 고정 칸만 준 줄은 장부 길을 타지 않고, 손에 쥔 막대·물 띠 막대·색 무리 반사·몸 뒤와 몸 앞 방패는
    장부가 세기만 한다 — 모두 장부 앞과 바이트가 같다."""
    src, hold, props, behind = _scene(scene)
    frames, _ = B.bake_breathe_sequence([src] * 24, HELD, hold=hold, props=props, behind=behind)
    assert hashlib.sha256(b"".join(f.tobytes() for f in frames)).hexdigest() == KEPT_BYTES[scene]


def test_a_row_without_pieces_records_no_piece_ledger(tmp_path) -> None:
    """고정 칸만 준 줄의 breathe.json 에는 쥔 물건 기록이 없다 — 가려진 칸도 지어낸 칸도 실리지 않고, 경고 줄도 없다."""
    from sprite_gen import cli

    src, legs, _ = _figure()
    loop = tmp_path / "loop"
    loop.mkdir()
    for i in range(12):
        src.save(loop / f"frame-{i:03d}.png")
    Image.fromarray(np.where(legs, 255, 0).astype(np.uint8), "L").save(tmp_path / "hold.png")
    out = tmp_path / "out"
    assert cli.main(["breathe", str(loop), str(out), "--chest-round", "0.025", "--arms-x", "0.02", "--breaths", "1",
                     "--torso-half", "21", "--hold-mask", str(tmp_path / "hold.png")]) == 0
    report = json.loads((out / "breathe.json").read_text(encoding="utf-8"))
    assert "hold" in report and "props" not in report and "props_behind" not in report
    assert "filled" not in json.dumps(report) and "hidden" not in json.dumps(report)
