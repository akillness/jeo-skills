# SPDX-License-Identifier: Apache-2.0
"""Breathe 의 가로·세로 최소·최대 (`width_min`·`width_max`·`height_min`·`height_max`).

세기(`depth`·`depth_x`)는 숨 곡선의 진폭이라 곡선이 0 아래로 내려가는 뒤 절반에 몸이 원래보다 좁아지고 머리가
원래보다 올라간다. 최소·최대 키는 같은 곡선·같은 박자의 바닥과 꼭대기를 사람이 쓴 값에 놓는다 — 최소 0 이면 그 뒤
절반이 원래 크기에 머문다. 지키는 것:

  1. 옛 키(`depth`·`depth_x` 만 쓴 줄)와 기본값은 이전과 바이트 같다.
  2. 최소 0 이면 어느 칸도 원래보다 좁거나 높지 않다.
  3. 쓴 값이 판에서 잰 극값과 1 칸 안에서 맞는다.
  4. 곡선 모양과 박자는 그대로다 — 옛 세기의 극값을 새 키로 쓰면 옛 바이트가 나오고, 곡선을 바닥 0 으로 옮겨
     구운 판(엔진을 고치기 전의 런타임 바꿔치기)과 새 키의 판이 바이트 같다.
  5. 새 키와 세기를 같이 쓰거나, 최소가 최대보다 크거나, 범위 밖이면 조용히 고르지 않고 거부한다.
"""

import hashlib
import json
import math

import numpy as np
import pytest
from PIL import Image

from sprite_gen.curate.curation import BREATHE_RANGE_MAX, state_breathe
from sprite_gen.effects import breathe as B
from sprite_gen.frames.extract import solid_alpha_bbox
from tests.effects.test_breathe import _dome, _humanoid, _outlined_figure, _small_outlined, _winged
from tests.effects.test_breathe_smooth import _bust


def _cfg(raw: dict) -> dict:
    return state_breathe({"states": {"idle": {"breathe": raw}}}, "idle")


def _digest(frames) -> str:
    return hashlib.sha256(b"".join(f.tobytes() for f in frames)).hexdigest()


def _tall_humanoid() -> Image.Image:
    """`_humanoid` 를 3 배 — 몸통 행에 부속이 없어 한 행의 폭이 곧 몸통 폭이다 (84 px)."""
    src = _humanoid()
    return src.resize((src.width * 3, src.height * 3), Image.NEAREST)


TORSO = 84            # `_tall_humanoid` 의 몸통 폭 — 머리(60)·목(24)보다 넓은 행이 몸통 행이다


def _torso_widths(frame: Image.Image) -> list[int]:
    """`_tall_humanoid` 칸의 몸통 행 폭들 — 콘텐츠 상자 폭은 숨이 안 걸리는 발끝 행이 원래 폭을 지켜 좁아짐을 못 본다."""
    counts = (np.asarray(frame.convert("RGBA"))[..., 3] != 0).sum(axis=1)
    return [int(c) for c in counts if c > 70]


def _extremes(src: Image.Image, frames, torso: bool = False) -> tuple[int, int, int, int]:
    """(가로 폭 변화 최소, 최대, 머리 윗선 오름 최소, 최대) — 칸마다 원본과 댄다. 오름은 위가 +. 가로는 콘텐츠 상자 폭
    (가장 넓은 행이 숨쉬는 부속인 그림), `torso` 면 숨이 가장 크게 걸린 몸통 행의 폭이다."""
    x0, y0, x1, _ = solid_alpha_bbox(src)
    widths, lifts = [], []
    for frame in frames:
        a0, b0, a1, _ = solid_alpha_bbox(frame)
        if torso:
            # 숨이 가장 크게 걸리는 행 = 원래 폭에서 가장 멀어진 몸통 행 (발끝 행은 원래 폭을 지킨다)
            widths.append(max((w - TORSO for w in _torso_widths(frame)), key=abs))
        else:
            widths.append((a1 - a0) - (x1 - x0))
        lifts.append(y0 - b0)
    return min(widths), max(widths), min(lifts), max(lifts)


# ── 1. 옛 키는 바이트 그대로 ─────────────────────────────────────────

# 최소·최대 키가 생기기 전(3.6.0, bf8db30)의 pixel 굽기 — 12칸. smooth 는 test_breathe_smooth 의 골든이 본다.
PIXEL_GOLDEN = [
    (_humanoid, {"depth": 0.06, "breaths": 1, "lag": 0.1},
     "cc0c43833127364ec4fc1c200f43269a712248f2d3b165b2197e22791ff2ea66"),
    (_winged, {"breaths": 2}, "5bdf0c0997cf799bc7e3a82374dce16fb65db3545fb3a5f1f1df7b249fcbaf0d"),
    (_dome, {"depth": 0.06, "depth_x": 0.12, "breaths": 1},
     "367ee5c53e9e8cbad436d4701aa733fda984cacc891263a20eb96cf8bd6f2cc2"),
    (_dome, {"depth": 0.10, "depth_x": 0.0, "breaths": 1},
     "50b19b67cbe3841f926e9c2d3cbbfb01e7354f77aaaabc38705adc1d962f2e2f"),
    (_small_outlined, {"depth": 0.08, "breaths": 3},
     "9aecdf05a249637d70962524deb794a2bd827edaea6c85936022eb705ee2296f"),
    (_outlined_figure, {"depth": 0.06, "breaths": 2, "lag": 0.0},
     "19ef450d0c6f972f84b53f9a9f864d4369b46277aec968e84357e49a05b4827a"),
]


@pytest.mark.parametrize("build,raw,digest", PIXEL_GOLDEN,
                         ids=["humanoid", "winged-default", "dome-depth-x", "dome-depth-x-zero", "small-outlined",
                              "figure-lag0"])
def test_old_keys_keep_their_bytes(build, raw, digest) -> None:
    frames, _ = B.bake_breathe_sequence([build()] * 12, _cfg(raw))
    assert _digest(frames) == digest, "세기(depth·depth_x)만 쓴 줄의 굽기가 바뀌었다"


def test_old_keys_keep_their_normalized_sidecar() -> None:
    """옛 줄의 정규화(breathe.json 의 config, 미리보기가 읽는 값)도 이전과 같은 키·같은 값이다."""
    assert _cfg({"depth": 0.06, "breaths": 2}) == {"depth": 0.06, "depth_x": None, "breaths": 2, "lag": 0.10,
                                                   "rigid_row": None, "axis_x": None, "torso_half": None,
                                                   "anatomy": None}
    smooth = _cfg({"mode": "smooth", "breaths": 1})
    assert (smooth["depth"], smooth["depth_x"]) == (0.0085, 0.028)
    assert not any(k in smooth for k in ("width_min", "width_max", "height_min", "height_max"))


# ── 2. 곡선의 바닥과 꼭대기 ──────────────────────────────────────────

def test_the_wave_peak_is_the_curve_top() -> None:
    """`WAVE_PEAK` 는 숨 곡선 `wave` 의 꼭대기다 (곡선이 홀함수라 바닥은 그 음수) — 최소·최대가 여기에 놓인다."""
    c = (-0.86 + math.sqrt(0.86 ** 2 + 4 * 0.56 * 0.28)) / (2 * 0.56)    # wave' = 0 의 cos(2πt)
    t = math.acos(c) / (2 * math.pi)
    assert B.WAVE_PEAK == pytest.approx(B.wave(t), abs=1e-15)
    grid = np.linspace(0.0, 1.0, 200001)
    values = 0.86 * np.sin(2 * np.pi * grid) + 0.14 * np.sin(4 * np.pi * grid)
    assert values.max() <= B.WAVE_PEAK + 1e-12 and values.min() >= -B.WAVE_PEAK - 1e-12


def test_old_depth_reads_as_a_range_around_the_original() -> None:
    """세기 d 는 바닥 -0.9009 d, 꼭대기 +0.9009 d 인 대칭 범위다 (세로; 가로는 몸통이 가장 크게 숨쉬는 행의 몫).
    breathe.json 의 `range` 가 이 값을 밝힌다 — 옛 판을 새 키로 옮길 때 읽는 숫자다."""
    src = _humanoid()
    cfg = _cfg({"depth": 0.06, "depth_x": 0.04, "breaths": 1})
    anat = B.resolve_anatomy(src, cfg)
    env, norm = B.envelope(anat)
    peak = max(env(j / max(1, anat.height - 1)) for j in range(anat.height))
    got = B.breathe_range(anat, cfg)
    assert got["height"] == pytest.approx((-0.06 * B.WAVE_PEAK, 0.06 * B.WAVE_PEAK))
    assert got["width"] == pytest.approx((-0.04 * B.WAVE_PEAK * norm * peak, 0.04 * B.WAVE_PEAK * norm * peak))
    raw = {"width_min": -0.01, "width_max": 0.05, "height_min": -0.04, "height_max": 0.0, "breaths": 1}
    assert B.breathe_range(anat, _cfg(raw)) == {"width": (-0.01, 0.05), "height": (-0.04, 0.0)}


@pytest.mark.parametrize("build,torso", [(_tall_humanoid, True), (_outlined_figure, False), (_winged, False)],
                         ids=["humanoid", "figure", "winged"])
def test_min_zero_is_never_narrower_nor_taller(build, torso) -> None:
    """가로 최소 0, 세로 최대 0 이면 어느 칸도 원래보다 좁지 않고 머리가 원래보다 높지 않다 — 숨의 뒤 절반이
    원래 크기에 머문다. 같은 그림을 세기로 구우면 좁고 높은 칸이 있다 (이 시험이 무엇을 잡는지)."""
    src = build()
    frames, _ = B.bake_breathe_sequence([src] * 24, _cfg({"width_min": 0.0, "width_max": 0.06, "height_min": -0.05,
                                                          "height_max": 0.0, "breaths": 2, "lag": 0.0}))
    narrowest, widest, lowest, highest = _extremes(src, frames, torso)
    assert narrowest >= 0, f"가로 최소 0 인데 원래보다 {-narrowest} 칸 좁은 칸이 있다"
    assert highest <= 0, f"세로 최대 0 인데 머리가 원래보다 {highest} 칸 높은 칸이 있다"
    assert widest > 0 and lowest < 0, "숨이 넓어지고 낮아지지 않는다"
    old, _ = B.bake_breathe_sequence([src] * 24, _cfg({"depth": 0.06, "breaths": 2, "lag": 0.0}))
    narrowest, _, _, highest = _extremes(src, old, torso)
    assert narrowest < 0 and highest > 0, "세기로 구운 판에 좁고 높은 칸이 없다 — 이 시험이 아무것도 못 가른다"


def test_min_zero_holds_on_every_row_and_phase() -> None:
    """칸 상자만이 아니라 행마다: 가로 이득 g 가 0 아래로, 세로 이득이 0 아래로 내려가는 위상·행이 없다."""
    src = _outlined_figure()
    cfg = _cfg({"width_min": 0.0, "width_max": 0.08, "height_min": -0.05, "height_max": 0.0, "breaths": 1,
                "lag": 0.1})
    anat = B.resolve_anatomy(src, cfg)
    (by, ay), (bx, ax) = B.pixel_gains(anat, cfg)
    curve = np.array([B.wave(t) for t in np.linspace(0.0, 1.0, 4001)] + [-B.WAVE_PEAK, B.WAVE_PEAK])
    assert (bx + ax * curve).min() >= -1e-15 and (by + ay * curve).min() >= -1e-15


@pytest.mark.parametrize("width,height", [((0.0, 0.06), (-0.05, 0.0)), ((-0.03, 0.08), (-0.06, 0.02)),
                                          ((0.02, 0.05), (-0.04, -0.01))],
                         ids=["min-zero", "both-sides", "never-the-original"])
def test_the_written_extremes_are_what_the_plate_measures(width, height) -> None:
    """쓴 값 = 판에서 잰 극값 (1 칸 안). 가로는 몸통 폭(이 그림의 몸통 행은 부속이 없어 콘텐츠 폭)이 가장 크게 숨쉬는
    행에서 늘거나 준 몫, 세로는 머리 윗선이 오르내린 칸을 목 아래 몸통 높이(기준 행 수)로 나눈 몫이다."""
    src = _tall_humanoid()
    cfg = _cfg({"width_min": width[0], "width_max": width[1], "height_min": height[0], "height_max": height[1],
                "breaths": 1, "lag": 0.0})
    anat = B.resolve_anatomy(src, cfg)
    frames, _ = B.bake_breathe_sequence([src] * 48, cfg, anat)
    narrowest, widest, lowest, highest = _extremes(src, frames, torso=True)
    want = (width[0] * TORSO, width[1] * TORSO, height[0] * anat.basis_rows, height[1] * anat.basis_rows)
    for name, got, expect in zip(("width_min", "width_max", "height_min", "height_max"),
                                 (narrowest, widest, lowest, highest), want):
        assert abs(got - expect) <= 1.0, f"{name}: 쓴 값은 {expect:.2f} 칸, 판에서 잰 극값은 {got} 칸"


# ── 3. 곡선 모양과 박자 그대로 ───────────────────────────────────────

@pytest.mark.parametrize("build,depth,depth_x", [(_humanoid, 0.06, None), (_outlined_figure, 0.06, None),
                                                 (_dome, 0.08, 0.12)], ids=["humanoid", "figure", "dome-depth-x"])
def test_the_old_extremes_as_new_keys_bake_the_old_bytes(build, depth, depth_x) -> None:
    """옛 세기의 극값을 새 키로 쓰면 옛 판과 바이트 같다 — 새 키는 같은 곡선·같은 박자의 바닥과 꼭대기만 정한다."""
    src = build()
    old = _cfg({"depth": depth, "breaths": 2, "lag": 0.1, **({} if depth_x is None else {"depth_x": depth_x})})
    anat = B.resolve_anatomy(src, old)
    width, height = B.breathe_range(anat, old)["width"], B.breathe_range(anat, old)["height"]
    new = _cfg({"width_min": width[0], "width_max": width[1], "height_min": height[0], "height_max": height[1],
                "breaths": 2, "lag": 0.1})
    want, phases = B.bake_breathe_sequence([src] * 24, old, anat)
    got, new_phases = B.bake_breathe_sequence([src] * 24, new, anat)
    assert new_phases == phases, "박자가 바뀌었다"
    assert _digest(got) == _digest(want), "옛 세기의 극값을 새 키로 썼는데 판이 다르다 — 곡선 모양이 바뀌었다"


@pytest.mark.parametrize("build", [_outlined_figure, _tall_humanoid], ids=["figure", "humanoid"])
def test_min_zero_is_the_wave_moved_onto_zero(build, monkeypatch) -> None:
    """엔진을 고치기 전, 곡선만 런타임에 [0, 원래 꼭대기] 로 옮겨 구운 판(`(wave(t) - wmin) / (wmax - wmin) * wmax`,
    depth 0.06)과 새 키(가로 최소 0, 세로 최대 0, 꼭대기는 depth 0.06 의 꼭대기)의 판이 바이트 같다."""
    src = build()
    old = _cfg({"depth": 0.06, "breaths": 2, "lag": 0.0})
    anat = B.resolve_anatomy(src, old)
    top = B.breathe_range(anat, old)
    new = _cfg({"width_min": 0.0, "width_max": top["width"][1], "height_min": top["height"][0],
                "height_max": 0.0, "breaths": 2, "lag": 0.0})
    got, _ = B.bake_breathe_sequence([src] * 24, new, anat)
    grid = np.linspace(0.0, 1.0, 200001)
    values = 0.86 * np.sin(2 * np.pi * grid) + 0.14 * np.sin(4 * np.pi * grid)
    wmin, wmax = float(values.min()), float(values.max())
    wave = B.wave
    monkeypatch.setattr(B, "wave", lambda t: (wave(t) - wmin) / (wmax - wmin) * wmax)
    want, _ = B.bake_breathe_sequence([src] * 24, old, anat)
    assert _digest(got) == _digest(want), "새 키의 최소 0 판이 곡선을 옮겨 구운 판과 다르다"


# ── 4. smooth ─────────────────────────────────────────────────────────

def test_smooth_from_zero_is_the_old_smooth_bytes() -> None:
    """smooth 의 세기는 쉼에서 0, 들숨 꼭대기에서 depth·depth_x 다 — 새 키로 [0, depth]·[0, depth_x] 를 쓰면 같은 판."""
    src = _bust(120)
    old = _cfg({"mode": "smooth", "depth": 0.02, "depth_x": 0.04, "breaths": 2})
    new = _cfg({"mode": "smooth", "width_min": 0.0, "width_max": 0.04, "height_min": 0.0, "height_max": 0.02,
                "breaths": 2})
    want, _ = B.bake_breathe_sequence([src] * 12, old)
    got, _ = B.bake_breathe_sequence([src] * 12, new)
    assert _digest(got) == _digest(want)
    anat = B.resolve_anatomy(src, new)
    assert B.smooth_lift(anat, new) == B.smooth_lift(anat, old) == 0.02 * anat.basis_rows
    assert B.breathe_range(anat, old) == {"width": (0.0, 0.04), "height": (0.0, 0.02)}


def test_smooth_min_moves_the_rest() -> None:
    """smooth 의 최소가 0 이 아니면 쉼(위상 0)의 칸도 그만큼 옮겨진다 — 위상 0 이 원본인 것은 최소 0 일 때다.
    오름 px(`smooth_lift`, Sway·박자 고르기가 읽는 값)는 쉼에서 꼭대기까지다."""
    src = _bust(120)
    cfg = _cfg({"mode": "smooth", "width_min": 0.01, "width_max": 0.04, "height_min": 0.005, "height_max": 0.02,
                "breaths": 1})
    anat = B.resolve_anatomy(src, cfg)
    assert B.phase_frame(src, cfg, 0.0, anat).tobytes() != src.tobytes()
    zero = _cfg({"mode": "smooth", "width_max": 0.04, "height_max": 0.02, "breaths": 1})
    assert B.phase_frame(src, zero, 0.0, anat).tobytes() == src.tobytes()
    assert B.smooth_lift(anat, cfg) == pytest.approx(0.015 * anat.basis_rows)


# ── 5. 거부 ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,word", [
    ({"depth": 0.06, "width_max": 0.05}, "depth"),
    ({"depth_x": 0.04, "height_min": -0.03}, "depth_x"),
    ({"mode": "smooth", "depth": 0.01, "height_max": 0.02}, "depth"),
    ({"width_min": 0.05, "width_max": 0.01}, "width_min"),
    ({"height_min": 0.0, "height_max": -0.02}, "height_min"),
    ({"width_max": BREATHE_RANGE_MAX + 0.01}, "width_max"),
    ({"height_min": -BREATHE_RANGE_MAX - 0.01}, "height_min"),
    ({"width_max": "wide"}, "width_max"),
    ({"width_max": True}, "width_max"),
    ({"chest_round": 0.05, "width_max": 0.05}, "width_max"),
], ids=["with-depth", "with-depth-x", "smooth-with-depth", "width-upside-down", "height-upside-down",
        "width-over", "height-under", "not-a-number", "a-bool", "round-chest"])
def test_refusals(raw, word) -> None:
    with pytest.raises(SystemExit, match=word):
        _cfg({"breaths": 1, **raw})


def test_a_bound_left_out_is_the_original_size() -> None:
    """적지 않은 경계는 0 — 원래 크기다. `width_max` 하나만 쓰면 가로만 넓어지고 세로는 그대로다."""
    cfg = _cfg({"width_max": 0.05, "breaths": 1})
    assert (cfg["width_min"], cfg["width_max"], cfg["height_min"], cfg["height_max"]) == (0.0, 0.05, 0.0, 0.0)
    assert "depth" not in cfg and "depth_x" not in cfg


def test_a_bake_handed_part_of_the_keys_reads_the_rest_as_zero() -> None:
    """정규화를 거치지 않고 굽기에 바로 준 설정도 같다 — 네 키 중 일부만 있으면 나머지는 0 이지 세기 줄이 아니다
    (큐레이터 미러 breatheBounds 와 같은 읽기)."""
    src = _humanoid()
    raw = {"width_max": 0.05, "breaths": 1, "lag": 0.1}
    for t in (0.25, 0.75):
        assert B.phase_frame(src, raw, t).tobytes() == B.phase_frame(src, _cfg(raw), t).tobytes()


def test_the_row_strain_cap_reads_the_extremes() -> None:
    """행당 변형 상한(0.25)은 새 키의 극값으로 잰다 — 가로 극값은 그 자체가 가장 크게 숨쉬는 행의 몫이라 범위
    안(0.20 까지)이면 걸리지 않고, 세로 극값은 목 아래 몸통에 고루 나눈 몫이라 변형 구간이 좁은 그림에서 걸린다."""
    src = _humanoid()
    anat = B.resolve_anatomy(src, {"rigid_row": 40})          # 목 아래가 짧아 세로 몫이 좁은 구간에 몰린다
    env, norm = B.envelope(anat)
    peak = max(env(j / max(1, anat.height - 1)) for j in range(anat.height))
    assert 0.20 * norm * peak > B.MAX_ROW_STRAIN, "이 그림은 세로 0.20 이 상한을 넘어야 시험이 된다"
    B.bake_breathe_sequence([src] * 4, _cfg({"width_max": 0.20, "breaths": 1, "rigid_row": 40}))
    with pytest.raises(SystemExit, match="height_min"):
        B.bake_breathe_sequence([src] * 4, _cfg({"height_min": -0.20, "breaths": 1, "rigid_row": 40}))


# ── 6. CLI ────────────────────────────────────────────────────────────

def test_the_cli_takes_the_four_keys_and_records_the_range(tmp_path) -> None:
    frames = tmp_path / "frames"
    frames.mkdir()
    for i in range(8):
        _tall_humanoid().save(frames / f"{i:03d}.png")
    out = tmp_path / "out"
    assert B.run(frames=str(frames), out=str(out), width_min=0.0, width_max=0.05, height_min=-0.04, breaths=2,
                 lag=0.0) == 0
    record = json.loads((out / "breathe.json").read_text(encoding="utf-8"))
    assert {k: record["config"][k] for k in ("width_min", "width_max", "height_min", "height_max")} == \
        {"width_min": 0.0, "width_max": 0.05, "height_min": -0.04, "height_max": 0.0}
    assert record["range"] == {"width": [0.0, 0.05], "height": [-0.04, 0.0]}
    with pytest.raises(SystemExit, match="depth"):
        B.run(frames=str(frames), out=str(tmp_path / "out2"), depth=0.06, width_max=0.05)
    assert not (tmp_path / "out2").exists()
