# SPDX-License-Identifier: Apache-2.0
"""결정론 호흡(idle breathing) — 봉투 기반 스쿼시&스트레치 (변형 강도 장).

호흡은 프레임 선택(깜빡임)과 직교하는 변조 레이어다 (maintainer 확정 2026-07-18).
설정은 curation.json 사이드카 `states.<state>.breathe` (curation.state_breathe 가
정규화 SSoT), 굽기는 compose/GIF 가 재생 시퀀스 위에 이 모듈의 수학으로 한다.
AI 개입 0 — 같은 입력이면 항상 같은 출력.

## 왜 분할선이 아니라 봉투인가 (2026-07-25 교체)

구 방식은 수평 분할선 위의 행을 정수 px 내리는 것이었다. 실제 출력은 **2상태 토글**
이라(측정: idle GIF 6프레임이 `f0==f2==f4`, `f1==f3==f5`) 호흡이 아니라 1px 진동으로
읽혔다. 머리를 잘라 붙이는 변형으로 바꿔봐도 잘린 단면이 목에 가로선으로 드러났다.

붙이는 연산이 있는 한 이음매는 없앨 수 없다. 그래서 **자르지 않는다.** 스프라이트
전체에 연속 변형장 하나를 걸고 그 강도를 목(또는 얼굴 아래)에서 0 으로 떨군다:

    env(y) = 발끝램프(y) x 강체테이퍼(y)          # 0 = 원본 그대로, 1 = 최대 변형
    g(y,t) = depth * norm * wave(t - lag*u(y)) * env(y)
    sx(y)  = 1 + g                                 # 가로
    sy(y)  = 1 / (1 + g)                           # 세로 (면적 보존)

## 불변식 (테스트가 지키는 것)

1. **강체 구간은 항등이다 — 근사가 아니다.** env=0 인 행은 g=0 -> 가로 사상이 원본
   좌표 그대로, sy=1 -> 누적 높이가 정확히 1씩 증가 -> 행 복제/삭제 0.
   그래서 그 구간은 프레임 간 **비트 동일**하다. 눈·입이 몇 도트뿐인 픽셀아트에서
   3% 세로 신장도 표정을 뭉개므로 이게 핵심 계약이다.
2. **가로 사상은 단조다.** X(x) = ∫ dens(s) ds 이고 dens > 0 이므로 접힘이 구조적으로
   불가능하다. 몸통만 1+g, 부속(날개)은 1 -> 날개는 밖으로 밀리기만 하고 안 늘어난다.
3. **몸통 축 열이 가로 사상의 고정점이다.** 출력 위치를 축의 적분값 기준으로 잡으므로
   축은 언제나 제자리이고, 그래서 (a) 변형이 0 이면 사상이 진짜 항등이 되고
   (b) 배율이 변해도 스프라이트가 통째로 좌우로 튀지 않는다. bbox 중앙을 기준으로
   잡으면 축이 중앙과 다른 캐릭터가 변형 0 에서도 밀린다 (회귀 2026-07-25 validator 검증).
4. **격자를 벗어나는 연산이 없다.** 세로는 행 정수 복제/삭제, 가로는 정수 열 사상.
   보간·블렌딩·비정수 스케일이 한 번도 일어나지 않으므로 출력이 항상 정수 도트다.
   언페이크(pitch 검출)를 프레임마다 다시 할 필요가 없는 이유이자, 다시 하면 안 되는
   이유이기도 하다 (synthetic_fixture_a up_run frame-2, 2026-07-22 하모닉 오검출 붕괴).
5. **루프 길이 불변.** 출력 프레임 수 = 입력 프레임 수. 호흡이 그 안에서 breaths 회
   딱 떨어진다.

(구 테이크 방식 — exhale 프레임을 raw 테이크로 굽고 전체 재추출 — 은 v1.56.31 에서
폐기: 깜빡임×호흡 조합 불가 + 적용마다 수 분 + 팔레트 드리프트. 봉투 방식은 그 셋 중
무엇도 해소하지 않으므로 되돌릴 근거가 없다.)

## smooth 모드 (큰 일러·영상 프레임)

위 불변식은 도트 그림의 것이다. 큰 일러에서는 같은 워프가 머리를 통째로 오르내리게 하고
(발이 고정이라 몸통이 늘면 그 위가 다 뜬다), 정수 행 복제가 칸마다 떨림으로 읽힌다. 가로줄을
통째로 올리는 것도 숨이 아니다 — 어깨와 가슴이 같이 올라 위아래로만 움직이는 것처럼 보인다.
`mode: "smooth"` 는 같은 해부를 쓰되 2차원 변위장 하나를 굽는다:

    가슴: 몸통 축 위 가슴 가운데의 타원 cos² 무게로 depth x 기준 높이만큼 오르고 depth_x 만큼 부푼다
          (몸이 옆을 보면 chest_tilt·chest_bias·chest_dir 로 타원을 눕히고 앞쪽을 키우고 앞-위로 보낸다)
    어깨: 어깨선 좌우가 가슴 오름의 shoulder 배만큼, shoulder_lag 만큼 늦게 오른다
    목 밴드(강체 경계 ~ 어깨선)에서 켜지고 콘텐츠 맨 아래에서 꺼진다

정사상(원본 점의 내용이 가는 자리)의 역을 고정점 반복으로 풀어 쌍선형으로 뜬다(곱한 알파).
강체 경계 위(목·턱 위)와 무게 밖은 원본 바이트 그대로다. 한 호흡은 0 에서 시작해 들숨 몫(`inhale`)의
위상에 1, 날숨에 0 으로 돌아오는 한쪽 혹이고 어깨의 늦음도 양 끝에서 0 이라, 위상 0 인 칸은 원본과
바이트 같다. 가슴 무게가 몸통 안에서 0 으로 떨어져 화면 변에 닿은 그림도 밖으로 밀리지 않는다.
줄 전체가 기준 칸(첫 칸)에서 잰 해부와 그 자리를 쓴다 — 영상 루프의 머리 윗선이 칸마다 흔들려도
경계는 움직이지 않는다.

## 둥근 가슴 (pixel — `chest_round`·`arms_x`)

도트 그림을 봉투 대신 가슴 꼭대기 P 에서 둥글게 부푸는 2차원 변위장으로 굽는다 (`round_displacement`): 가슴 타원 안은
고르게 늘고 밖은 통째로 밀리며, 팔은 옆으로 통째 밀리고, 머리와 선 발은 그대로다. 정사상의 역을 smooth 처럼 풀되 그 자리의
원본 칸 하나를 통째로 옮긴다 — 출력의 칸은 모두 원본의 칸이라 새 색이 없다. 사람이 준 고정 칸(`--hold-mask`)은 장이 0 이라
바이트 그대로고, 팔이 쥔 물건(`--props-mask`, 몸 뒤에 든 것은 `--props-behind-mask`)은 조각마다 쥔 손과 같은 칸만큼 통째로
옮겨진다 (`row_pins`, `_place_pieces`). 고정 칸 밑으로 들어가 가려진 조각 칸은 조각마다 칸마다 세어 breathe.json 과 경고 줄에
남긴다 — 조용히 버리지 않는다.

루프 세트의 들어감·나옴 조각은 루프의 숨을 그 루프의 한 칸에서 잇는 토막이다 (`loop_cells`·`start_cell`): 칸 i 의
위상은 루프 칸 (start_cell + i) mod loop_cells 의 위상이다. 토막의 첫 칸은 루프의 첫 칸이 아니라서 `sprite-gen breathe
--reference` 로 루프의 첫 칸을 기준 칸으로 주면 해부와 그 자리가 루프의 것과 같다.
"""

from __future__ import annotations

import argparse
import hashlib
import math
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.effects.anatomy import Anatomy, analyze
from sprite_gen.curate.curation import (BREATHE_MODES, BREATHE_PIXEL, BREATHE_RANGE_KEYS, BREATHE_SMOOTH,
                                        BREATHE_SMOOTH_DEPTH, BREATHE_SMOOTH_DEPTH_X, BREATHE_SMOOTH_SHAPE,
                                        normalize_transform, state_breathe)
from sprite_gen.frames.extract import BORDER_MIN_FRACTION, FRAME_SIDES, own_border, solid_alpha_bbox
from sprite_gen.frames.folder import cycle_frame_ms, open_frames, publish, reference_frame

# 강체 경계에서 변형 강도가 0 이 되기까지의 테이퍼 반폭 (콘텐츠 높이 비율).
# 이 테이퍼가 이음매를 없앤다 — 경계에서 강도가 계단이 아니라 경사로 떨어진다.
TAPER = 0.055
# 발끝 고정 램프 — 변형 구간 아래쪽 이 비율만큼은 강도가 0 에서 올라온다 (발이 안 뜬다).
FOOT = 0.28
# 행당 변형 상한. 넘으면 조용히 깎지 않고 멈춘다 (No Silent Fallback).
MAX_ROW_STRAIN = 0.25
# 기본 진폭 — 몸통 높이 대비 총 신장량.
DEFAULT_DEPTH = 0.06
# 진행파 위상지연 (호흡 주기 비율) — 몸통 윗부분이 늦게 밀어올려 머리가 한 박자 늦게 온다.
DEFAULT_LAG = 0.10
# 한 호흡이 부드럽게 읽히려면 필요한 최소 프레임 수 (프레임을 찍어낼 때의 권고치).
SMOOTH_CYCLE_FRAMES = 6
DEFAULT_SMOOTH_DEPTH = BREATHE_SMOOTH_DEPTH
DEFAULT_SMOOTH_DEPTH_X = BREATHE_SMOOTH_DEPTH_X
SMOOTH_SHAPE = dict(BREATHE_SMOOTH_SHAPE)
# smooth 의 어깨 혹 — 몸통 축에서 좌우로 몸통 반폭의 이 배 자리, 가로 반지름도 몸통 반폭 비율.
SHOULDER_X = 0.55
SHOULDER_RX = 0.45


# ── 파형 ────────────────────────────────────────────────────────────

def wave(t: float) -> float:
    """한 호흡의 기본 파형. 2차 하모닉을 살짝 섞어 정점이 뾰족해진다(들숨의 어택)."""
    return 0.86 * math.sin(2 * math.pi * t) + 0.14 * math.sin(4 * math.pi * t)


# `wave` 의 꼭대기 — 곡선이 홀함수라 바닥은 그 음수다. 세기 d 의 숨은 이 곡선에 d 를 곱해 바닥 -WAVE_PEAK·d 에서 꼭대기
# +WAVE_PEAK·d 를 오가고, 최소·최대 키는 같은 곡선의 바닥과 꼭대기를 쓴 값에 놓는다. 식(wave' = 0 인 cos 2πt 가 이차식의
# 근)으로 풀지 않고 수로 적는다 — 미러(breathe.js)가 다른 libm 으로 끝자리가 다른 값을 내지 않게.
WAVE_PEAK = 0.9008738286182177


def smoothstep(a: float, b: float, x: float) -> float:
    if b <= a:
        return 1.0 if x >= b else 0.0
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)


# ── 변형 강도 봉투 ──────────────────────────────────────────────────

def envelope(anat: Anatomy, taper: float = TAPER, foot: float = FOOT):
    """(env(u), 진폭 정규화 계수) — u = 0(발바닥) .. 1(정수리).

    정규화: 테이퍼·발끝램프가 변형 구간을 갉아먹으므로 그대로 두면 강체 경계가 낮은
    캐릭터일수록 호흡이 작아진다. sum(env) 로 나눠 **총 신장량이 항상
    depth × 기준높이**가 되게 한다 — 진폭 숫자가 캐릭터와 무관하게 같은 뜻을 갖는다."""
    height = anat.height
    ru = anat.rigid_u
    band = max(1.5, taper * height) / max(1, height)
    foot_top = foot * ru

    def env(u: float) -> float:
        return smoothstep(0.0, foot_top, u) * (1.0 - smoothstep(ru - band, ru + band, u))

    total = sum(env(j / max(1, height - 1)) for j in range(height))
    norm = anat.basis_rows / total if total > 1e-6 else 0.0
    return env, norm


def protect(anat: Anatomy):
    """부속 보호 가중 p(x) — 1 이면 그 열은 가로로 안 늘어난다 (콘텐츠 bbox 상대 x, 열 하나 또는 열 배열).
    값은 열에만 달려 있어 굽기는 칸마다 열 배열로 한 번 잰다.

    자동 검출 밴드는 부속(날개·긴 팔)이 실재할 때만 켜지고 램프 끝을 max_half 에
    앵커한다. **수동 밴드(큐레이터 영역 UI)는 무조건 켜지고 램프를 밴드 자체에
    앵커한다** — 블롭(max_half ≈ torso_half)에서 자동 램프는 몸 끝까지 완만해 밴드를
    아무리 좁혀도 보호가 1 에 도달하지 못했다 (실측 2026-07-30 synthetic silhouette 문어:
    밴드 12→4 에 출력 차이가 바이트 22개, maintainer "버그로 보여"). 사람이 밴드를 그렸으면
    그 밖은 밀리기만 해야 한다."""
    cx = anat.axis_x
    if anat.torso_source == "manual":
        t0 = float(anat.torso_half)
        t1 = t0 + 2.0
        return lambda x: _smoothstep_array(t0, t1, np.abs(np.asarray(x) - cx))
    if not anat.has_appendage:
        return lambda x: np.zeros(np.shape(x))
    t0 = anat.torso_half * 1.15
    t1 = max(t0 + 1.0, anat.max_half * 0.95)
    return lambda x: _smoothstep_array(t0, t1, np.abs(np.asarray(x) - cx))


def envelope_peak(anat: Anatomy) -> float:
    """봉투의 가장 큰 값 — 숨이 가장 크게 걸리는 행의 env (보통 1)."""
    env, _ = envelope(anat)
    return max(env(j / max(1, anat.height - 1)) for j in range(anat.height))


def row_strain(anat: Anatomy, depth: float) -> float:
    """행당 최대 변형 — MAX_ROW_STRAIN 초과 여부 판정용 (관측 가능하게 노출). 세기 줄의 판정이다: 세기 d 의 실제 극값은
    WAVE_PEAK·d 라 이 값은 극값보다 1/WAVE_PEAK 배 넉넉하게 막는다 (그대로 둔다 — 옛 줄의 판정이 바뀌지 않게)."""
    _, norm = envelope(anat)
    return depth * norm * envelope_peak(anat)


# ── 숨의 크기: 세기 또는 최소·최대 ─────────────────────────────────
#
# 세기(`depth`·`depth_x`)는 곡선 `wave` 에 곱하는 진폭이고, 최소·최대(`width_min`·`width_max`·`height_min`·`height_max`)는 같은
# 곡선의 바닥과 꼭대기를 원래 크기 대비 몫으로 바로 적은 것이다. 굽기는 둘 다 축마다 이득 계수 (B, A) 로 읽어 행 u·위상 t 의
# 이득을 g = (B + A·wave(t - lag·u'))·env(u) 로 쓴다 — 세기 줄은 B = 0, A = d·norm 이라 옛 식 d·norm·wave·env 와 같은 연산이다.
# pixel 의 짝: 곡선 꼭대기에서 가로 최대·세로 최소(넓어질 때 낮아진다), 바닥에서 가로 최소·세로 최대.
#   가로 몫 = 몸통 열이 가장 크게 숨쉬는 행(env 최대)에서 넓어지는 몫 = g 그 자체
#   세로 몫 = 목 아래 몸통(기준 행 수) 대비 머리 윗선이 오르는 몫 ≈ -Σg / 기준 행 수 = -(B + A·wave)/norm
# smooth 의 짝: 쉼(곡선 0)에서 최소, 들숨 꼭대기(곡선 1)에서 최대 — 가슴이 부풀며 오른다.

def _bounds(cfg: dict) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """((가로 최소, 최대), (세로 최소, 최대)) — 줄이 최소·최대 키로 적혔으면. 정규화는 네 키를 다 싣지만, 정규화를 거치지
    않은 설정도 적지 않은 경계를 0 으로 읽는다 (state_breathe·미러 breatheBounds 와 같다). 세기 줄은 None."""
    if all(cfg.get(k) is None for k in BREATHE_RANGE_KEYS):
        return None
    value = lambda k: 0.0 if cfg.get(k) is None else float(cfg[k])
    return ((value("width_min"), value("width_max")), (value("height_min"), value("height_max")))


def pixel_gains(anat: Anatomy, cfg: dict) -> tuple[tuple[float, float], tuple[float, float]]:
    """pixel 봉투의 이득 계수 ((세로 B, A), (가로 B, A)) — 행 u·위상 t 의 이득은 (B + A·wave(t - lag·u'))·env(u), 가로 배율
    1 + g, 세로 배율 1 / (1 + g). 세기 줄은 (0, d·norm) 이라 옛 굽기와 같은 연산이고, 최소·최대 줄은 곡선의 꼭대기
    (wave = WAVE_PEAK)와 바닥(-WAVE_PEAK)에서 쓴 값이 나오게 둔다."""
    _, norm = envelope(anat)
    bounds = _bounds(cfg)
    if bounds is None:
        depth, depth_x = _pixel_depths(cfg)
        return (0.0, depth * norm), (0.0, (depth if depth_x is None else depth_x) * norm)
    (w_lo, w_hi), (h_lo, h_hi) = bounds
    peak = envelope_peak(anat)
    across = (0.0, 0.0) if peak <= 0.0 else ((w_lo + w_hi) / (2.0 * peak), (w_hi - w_lo) / (2.0 * WAVE_PEAK * peak))
    return (-norm * (h_lo + h_hi) / 2.0, norm * (h_hi - h_lo) / (2.0 * WAVE_PEAK)), across


def breathe_range(anat: Anatomy, cfg: dict) -> dict[str, tuple[float, float]]:
    """줄의 숨이 오가는 가로·세로 (최소, 최대) — 최소·최대 키의 단위로. 최소·최대 줄은 쓴 값 그대로, 세기 줄은 그 세기의
    극값이다 (pixel: 세로 ∓WAVE_PEAK·depth, 가로 ∓WAVE_PEAK·depth_x·norm·봉투 최대; smooth: 쉼 0 에서 depth·depth_x).
    `sprite-gen breathe` 가 breathe.json `range` 에 싣는다 — 세기로 구운 판을 최소·최대로 옮길 때 읽는 수다."""
    bounds = _bounds(cfg)
    if bounds is not None:
        return {"width": bounds[0], "height": bounds[1]}
    if breathe_mode(cfg) == BREATHE_SMOOTH:
        depth, swell = _smooth_depths(cfg)
        return {"width": (0.0, swell), "height": (0.0, depth)}
    _, norm = envelope(anat)
    depth, depth_x = _pixel_depths(cfg)
    across = (depth if depth_x is None else depth_x) * WAVE_PEAK * norm * envelope_peak(anat)
    return {"width": (-across, across), "height": (-depth * WAVE_PEAK, depth * WAVE_PEAK)}


# ── 외곽선 1px 다듬기 ───────────────────────────────────────────────

def _dark(rgba: np.ndarray) -> np.ndarray:
    """다듬기의 '외곽선 어두움' 판정 (화소마다) — 외곽선과 어두운 음영을 갈라야 한다.

    실측(문어 idle 왼쪽 볼, 2026-07-30): 외곽선 lum 0~13, 어두운 음영 73~92, 내부 112+.
    구 문턱 96 은 음영까지 외곽선으로 세어 (외곽,외곽,음영) 3연속이 '전부 어두움' 이
    되니 다듬기 패턴이 발화하지 않아 볼의 바깥 검은 열이 잔존했다. 60 이 두 군집
    사이를 가른다."""
    return (rgba[..., 3] != 0) & (0.299 * rgba[..., 0] + 0.587 * rgba[..., 1] + 0.114 * rgba[..., 2] < 60.0)


def _thin_outline_1px(rgba: np.ndarray) -> None:
    """안쪽점 기준 다듬기를 고정점까지 반복 — 한 패스의 제거가 새 돌출점을 만들 수 있다.

    실측(문어 idle 위상 0): 2점 패턴의 바깥점 (2,13) 을 지우면 남은 (3,13) 이 이웃 행보다
    1px 튀어나온 새 돌출점이 되는데, 단일 패스 스냅샷은 그걸 못 본다. 각 패스가 불투명
    픽셀을 단조 감소시키므로 종료가 보장된다 (JS 미러 동일). `rgba` (h, w, 4) 를 그 자리에서 고친다."""
    while _thin_outline_pass(rgba):
        pass


def _thin_outline_pass(rgba: np.ndarray) -> int:
    """워프된 프레임의 실루엣 외곽선 2px 를 **안쪽점 기준** 1px 로 정규화하는 1패스.

    세로 스쿼시&스트레치는 정수 행 복제/삭제라, 가파른 대각선 외곽선이 국소적으로 2px
    두께가 되며 위상마다 위치를 바꿔 "간헐 2줄 검은점" 으로 읽힌다 (실측 2026-07-30:
    문어 idle 왼쪽 볼, maintainer 발견). 각 열/행의 실루엣 끝에서 '어두움-어두움-내부색'
    3연속을 만나면 **바깥 픽셀을 제거(알파 0)** 해 이웃 행들과 정렬된 **안쪽** 선만
    남긴다 — 초기 구현은 안쪽을 내부색으로 되돌려 바깥점을 선으로 남겼는데, 돌출한
    바깥점이 이웃 행 선과 어긋나 여전히 2줄로 읽혔다 (maintainer 실기기 판정 2026-07-30:
    "안쪽 검은점 기준이 더 정확하다").

    안전 필터 — 제거가 새 결함을 만들면 안 된다:
      · 제거된 자리의 수직(가로 패턴)/수평(세로 패턴) 이웃이 불투명 내부색이면 제거로
        실루엣 끝에 내부색이 노출된다 → 제외.
      · 이웃 양쪽이 제거되지 않는 어두운 픽셀이면 어두운 선 **중간에 구멍**이 난다 → 제외.
      · 이웃이 같은 패스에서 같이 제거되는 후보면 안전(돌출 열/행이 통째로 사라짐).
      제외가 다른 후보의 안전성을 바꾸므로 고정점까지 반복한다. 제외는 단조다 — 후보가 빠질수록
      이웃의 '남는 어두움' 만 늘어 제외가 늘 뿐 풀리지 않는다 — 그래서 하나씩 빼든 한꺼번에 빼든
      같은 집합(가장 큰 안전 집합)에 닿는다. 여기서는 패스마다 실패한 후보를 한꺼번에 뺀다.

    호출자는 **변형이 실제로 일어난 프레임에만** 부른다(_warp 의 deformed 게이트). 변형 0
    프레임은 이 함수를 타지 않아 "변형 0 = 원본 동일" 계약이 유지된다. 원본 스냅샷에서만
    읽고 한 번에 적용하므로 순회 순서와 무관하게 결과가 같다(JS 미러 바이트 동일 성질).
    화소 순회 대신 배열로 읽는다 — 큰 칸에서는 굽기 시간의 대부분이 이 다듬기다."""
    h, w = rgba.shape[:2]
    op = rgba[..., 3] != 0
    dark = _dark(rgba)
    kind = np.zeros((h, w), np.int8)            # 후보: 1 = 열 끝 패턴('v'), 2 = 행 끝 패턴('h')
    # 열 끝 패턴 — 그 열의 맨 위·맨 아래 불투명에서 '어두움-어두움-내부색'
    cols = np.flatnonzero(op.any(axis=0))
    if cols.size == 0:
        return 0
    t0 = op[:, cols].argmax(axis=0)
    b0 = h - 1 - op[::-1, cols].argmax(axis=0)
    three = t0 + 2 <= b0
    y1, y2 = np.minimum(t0 + 1, h - 1), np.minimum(t0 + 2, h - 1)
    top = three & dark[t0, cols] & dark[y1, cols] & op[y2, cols] & ~dark[y2, cols]
    y1, y2 = np.maximum(b0 - 1, 0), np.maximum(b0 - 2, 0)
    bottom = three & dark[b0, cols] & dark[y1, cols] & op[y2, cols] & ~dark[y2, cols]
    kind[t0[top], cols[top]] = 1
    kind[b0[bottom], cols[bottom]] = 1
    # 행 끝 패턴 — 열 끝 후보가 이미 잡은 자리는 그대로 둔다 (먼저 잡은 축이 이긴다)
    has = op.any(axis=1)
    rows = np.flatnonzero(has)
    lo = np.full(h, -1, np.int64)
    hi = np.full(h, -1, np.int64)
    lo[rows] = op[rows].argmax(axis=1)
    hi[rows] = w - 1 - op[rows, ::-1].argmax(axis=1)
    l0, r0 = lo[rows], hi[rows]
    three = l0 + 2 <= r0
    x1, x2 = np.minimum(l0 + 1, w - 1), np.minimum(l0 + 2, w - 1)
    left = three & dark[rows, l0] & dark[rows, x1] & op[rows, x2] & ~dark[rows, x2]
    x1, x2 = np.maximum(r0 - 1, 0), np.maximum(r0 - 2, 0)
    right = three & dark[rows, r0] & dark[rows, x1] & op[rows, x2] & ~dark[rows, x2]
    for ys, xs in ((rows[left], l0[left]), (rows[right], r0[right])):
        free = kind[ys, xs] == 0
        kind[ys[free], xs[free]] = 2
    # 1px 단독 돌출점 — 그 행의 어두운 끝점이 위아래 행 끝보다 정확히 1px 바깥으로 튀어나온
    # 경우(가로 매핑 반올림이 행마다 갈린 아티팩트). 2점 패턴이 아니라 위 후보에 안 잡힌다.
    # 점을 지우고 **안쪽 자리에 그 색을 그대로 그린다** — 이웃 행들과 정렬된 안쪽 선이 된다.
    # 안전: 돌출 정의상 (x, y±1) 은 투명이라(이웃 행 끝이 더 안쪽) 제거로 노출·구멍이 없다.
    # 가로(좌우) 한정 — 세로(정수리) 1px 계단은 작가 의도(머리카락 스파이크류)와 구분이
    # 안 돼 건드리지 않는다.
    mid = rows[(rows >= 1) & (rows <= h - 2)]
    mid = mid[has[mid - 1] & has[mid + 1]]
    moves: dict[tuple[int, int], np.ndarray] = {}   # 안쪽좌표 (y, x) -> 칠할 색 (같은 행이면 오른쪽이 덮는다)
    m = lo[mid]
    inner = np.minimum(m + 1, w - 1)
    jut = (np.minimum(lo[mid - 1], lo[mid + 1]) - m == 1) & dark[mid, m] & (m + 1 < w) & op[mid, inner]
    r = hi[mid]
    inner_r = np.maximum(r - 1, 0)
    jut_r = (r - np.maximum(hi[mid - 1], hi[mid + 1]) == 1) & dark[mid, r] & (r >= 1) & op[mid, inner_r]
    for ys, xs, into in ((mid[jut], m[jut], inner[jut]), (mid[jut_r], r[jut_r], inner_r[jut_r])):
        free = kind[ys, xs] == 0
        kind[ys[free], xs[free]] = 2
        paint = ~dark[ys, into]
        for y, x, ix in zip(ys[paint].tolist(), xs[paint].tolist(), into[paint].tolist()):
            moves[(y, ix)] = rgba[y, x].copy()
    # 안전 필터 고정점
    cy, cx = np.nonzero(kind)
    row_pattern = kind[cy, cx] == 2
    near = []                                   # 두 이웃 (가로 패턴은 위·아래, 세로 패턴은 왼·오른)
    for step in (-1, 1):
        ny = np.where(row_pattern, cy + step, cy)
        nx = np.where(row_pattern, cx, cx + step)
        inside = (ny >= 0) & (ny < h) & (nx >= 0) & (nx < w)
        ny, nx = np.clip(ny, 0, h - 1), np.clip(nx, 0, w - 1)
        near.append((ny, nx, inside & op[ny, nx], inside & dark[ny, nx]))
    drop = kind != 0
    alive = np.ones(cy.size, bool)
    while True:
        bad = np.zeros(cy.size, bool)
        kept_dark = np.ones(cy.size, bool)
        for ny, nx, n_op, n_dark in near:
            kept = n_op & ~drop[ny, nx]
            bad |= kept & ~n_dark               # 내부색이 실루엣 끝으로 노출된다
            kept_dark &= kept & n_dark          # 어두운 선 중간 구멍
        failing = alive & (bad | kept_dark)
        if not failing.any():
            break
        alive &= ~failing
        drop[cy[failing], cx[failing]] = False
    rgba[cy[alive], cx[alive]] = 0
    applied = int(alive.sum())
    for (y, x), color in moves.items():
        if not drop[y, x]:
            rgba[y, x] = color
            applied += 1
    return applied


# ── 워프 ────────────────────────────────────────────────────────────

def _warp(frame: Image.Image, anat: Anatomy, lag: float, t: float,
          gains: tuple[tuple[float, float], tuple[float, float]]) -> Image.Image:
    """한 위상 t 의 프레임 — 캔버스 크기 불변, 발바닥 고정.

    세로는 행 국소 배율을 누적해 각 원본 행이 출력에서 몇 행을 차지하는지 정하고,
    가로는 행 안에서 위치마다 다른 밀도를 적분해 단조 사상을 만든다. 둘 다 정수
    연산이라 출력이 정수 도트다. 한 행의 사상은 배열 하나로 만든다 — 밀도 누적합은 차례대로
    더하고(`np.cumsum`), 출력 열마다의 원본 열은 축 기준 경계를 넘은 개수다(`searchsorted`).

    `gains` 는 축마다 이득 계수 ((세로 B, A), (가로 B, A)) — `pixel_gains`. 가로 성분은 세로와 따로다 (maintainer 요청
    2026-07-30 — 가로/세로 분리): 가로 (0, 0) 이면 가로 사상이 전 위상 항등이다. 파형·봉투·지연은 두 축이 공유한다 —
    축마다 다른 건 계수뿐이다."""
    box = solid_alpha_bbox(frame)
    if not box:
        return frame.copy()
    body = np.asarray(frame.convert("RGBA").crop(box))
    height, width = body.shape[:2]
    canvas_w, canvas_h = frame.size
    anchor_x = box[0] + anat.axis_x
    baseline = box[3]

    env, _ = envelope(anat)
    keep_cols = 1.0 - protect(anat)(np.arange(width))   # 열마다 늘어나는 몫 — 행마다 같다
    ru = anat.rigid_u
    down, across = gains

    def gain(u: float, k: tuple[float, float]) -> float:
        e = env(u)
        if e <= 0.0:
            return 0.0
        return (k[0] + k[1] * wave(t - lag * min(1.0, u / max(1e-6, ru)))) * e

    # 세로 누적 — j=0 이 정수리
    heights: list[float] = []
    acc = 0.0
    for j in range(height):
        g = gain(1.0 - j / max(1, height - 1), down)
        acc += 1.0 if g == 0.0 else 1.0 / (1.0 + g)
        heights.append(acc)
    total = max(1, math.floor(acc + 0.5))

    out = np.zeros((canvas_h, canvas_w, 4), np.uint8)
    opaque = body[..., 3] != 0
    y_cursor = baseline - total
    prev = 0
    clipped = 0
    off = dict.fromkeys(FRAME_SIDES, 0)   # 변마다 밖으로 나간 불투명 (모서리 밖은 두 변 모두에 센다)
    deformed = False   # 이 위상에서 변형이 실제로 일어났나 (다듬기 게이트)
    for j in range(height):
        u = 1.0 - j / max(1, height - 1)
        cur = math.floor(heights[j] + 0.5)
        reps = max(0, cur - prev)
        prev = cur
        if reps == 0:
            continue
        g = gain(u, across)                  # 가로 성분 — 독립 계수 (depth_x, width_*)
        if reps != 1:
            deformed = True                  # 행 복제/삭제 = 세로 변형이 실재
        if g == 0.0:
            # 변형 없음 = 원본 위치 그대로. 축 고정점 사상의 g->0 극한과 정확히 같다.
            out_x = box[0] + np.arange(width)
            src_x = np.arange(width)
        else:
            deformed = True                  # 가로 사상 변형이 실재
            dens = np.maximum(0.05, 1.0 + g * keep_cols)
            edge = np.concatenate(([0.0], np.cumsum(dens)))
            origin = edge[anat.axis_x]       # 축을 고정점으로 — 여기가 anchor_x 에 박힌다
            # half-up 반올림: 파이썬 기본 round() 는 은행가 반올림(round(0.5)==0)이라
            # JS Math.round(half-up) 미러와 .5 경계에서 갈린다. 규칙을 명시해 고정한다.
            lo = math.floor(edge[0] - origin + 0.5)
            hi = math.floor(edge[width] - origin + 0.5)
            ox = np.arange(lo, hi)
            src_x = np.searchsorted(edge[1:width] - origin, ox, side="right")
            out_x = anchor_x + ox
            # 외곽선 보존: 가로 축소 위상에서 forward 밀도매핑이 실루엣 양끝 열을 통째로
            # 떨궈 1px 외곽선이 사라진다(발끝 플리커, 실측 2026-07-30: 문어 idle y25~y28
            # 이 날숨 위상마다 소실). 이 행의 최말단 불투명 소스 열(= 외곽선)을 출력의
            # 양끝 불투명 픽셀에 그대로 실어 항상 1px 외곽선이 남게 한다 — 원본 외곽선
            # 픽셀을 복사하므로 색·밝기가 정확히 보존되고(재도색 아님) 위상 간 잔여
            # 깜빡임이 없다. g==0 항등 분기(위)는 손대지 않아 "변형 0 = 원본 동일" 계약이
            # 그대로 산다. 축소가 아니면(양끝이 이미 외곽선을 실으면) no-op 이다.
            row_op = np.flatnonzero(opaque[j])
            ends = np.flatnonzero(opaque[j, src_x])
            if row_op.size and ends.size:
                src_x[ends[-1]] = row_op[-1]
                src_x[ends[0]] = row_op[0]
        pixels = body[j, src_x]
        shown = pixels[:, 3] != 0
        left = int(np.count_nonzero(shown & (out_x < 0)))
        right = int(np.count_nonzero(shown & (out_x >= canvas_w)))
        inside = shown & (out_x >= 0) & (out_x < canvas_w)
        n_shown, n_inside = int(np.count_nonzero(shown)), int(np.count_nonzero(inside))
        for r in range(reps):
            yy = y_cursor + r
            if 0 <= yy < canvas_h:
                out[yy, out_x[inside]] = pixels[inside]
                clipped += n_shown - n_inside
            else:
                clipped += n_shown
                off["top"] += n_shown if yy < 0 else 0
            off["left"] += left
            off["right"] += right
        y_cursor += reps
    if clipped:
        # 조용히 자르지 않는다 — 정수리나 옆구리가 셀 밖으로 나가면 스프라이트가
        # 망가지고, 그건 여백이나 진폭을 사람이 정해야 하는 문제다 (No Silent Fallback).
        raise SystemExit(
            f"breathe: 늘어난 프레임이 셀 밖으로 나가 불투명 픽셀 {clipped}개가 잘린다 — {_sides_off(off)} "
            f"(셀 {canvas_w}x{canvas_h}, 콘텐츠 {box[0]},{box[1]}-{box[2]},{box[3]}). {_clip_advice(frame, off)}")
    if deformed:
        _thin_outline_1px(out)
    return Image.fromarray(out, "RGBA")


SIDE_NAMES = dict(zip(FRAME_SIDES, ("위", "왼쪽", "오른쪽")))


def _sides_off(off: dict[str, int]) -> str:
    return ", ".join(f"{SIDE_NAMES[s]} 변 밖 {off[s]}" for s in FRAME_SIDES if off[s])


def _clip_advice(frame: Image.Image, off: dict[str, int]) -> str:
    """pixel 이 셀 밖으로 민 칸의 거절 문구 끝 — 무엇을 하라는지. 밀려 나간 변이 그 칸 그림 자체의 테두리면
    (`own_border`, video-frames 와 같은 판정) 그림이 원래 화면에 잘린 것일 수 있다 — 큰 일러·영상 칸은 smooth 가
    머리와 화면 변을 제자리에 둔다. 여백 0 으로 자른 도트 스프라이트도 같은 판정에 걸려 둘을 가를 수 없으니 두
    길을 다 말한다. 여백을 붙여 굽고 잘라 내는 우회는 밀려 나간 만큼을 조용히 잃는다."""
    sides, outer = own_border(np.asarray(frame.convert("RGBA"))[..., 3] != 0)
    crossed = [s for s in FRAME_SIDES if off[s] and s in sides]
    if not crossed:
        return "셀 여백을 늘리거나 숨의 크기(depth, 또는 최소·최대)를 줄여라."
    covers = ", ".join(f"{SIDE_NAMES[s]} 변 바깥 줄 {outer[s]} px" for s in crossed)
    return (f"그림이 {covers} 를 덮는다 — 그 변 길이의 {BORDER_MIN_FRACTION * 100:g} % 이상이라 그림 자체의 테두리로 "
            f"읽힌다. 원래 화면에 잘린 그림(큰 일러·영상 칸)이면 mode smooth(`--mode smooth`)로 구워라 — 머리와 "
            f"화면 변이 제자리에 있다. 여백을 붙여 굽고 잘라 내지 마라 — 밀려 나간 만큼 조용히 잃는다. 도트 "
            f"스프라이트면 셀 여백을 늘리거나 숨의 크기(depth, 또는 최소·최대)를 줄여라.")


# ── smooth 모드 (큰 일러·영상 프레임) ───────────────────────────────

def breathe_mode(cfg: dict) -> str:
    """cfg 의 굽기 방식 — 생략은 pixel. 모르는 값을 조용히 pixel 로 굽지 않는다."""
    mode = cfg.get("mode")
    if mode is None:
        return BREATHE_PIXEL
    if not isinstance(mode, str) or mode not in BREATHE_MODES:
        raise SystemExit(f"breathe: mode {mode!r} 를 모른다 — {' | '.join(BREATHE_MODES)} 중 하나다.")
    return mode


def smooth_wave(t: float, inhale: float) -> float:
    """smooth 의 한 호흡 — 위상 0 에서 0, 들숨 끝(위상 `inhale`)에 1, 날숨 끝에 다시 0.

    pixel 의 `wave` 는 위아래로 흔드는 사인이고 진행파 지연까지 있어 위상 0 에서도 윗행이
    움직인다. 여기는 쉼(0)에서 올랐다 돌아오기만 하는 한쪽 혹이고, 양 끝과 정점에서 기울기가
    0 이라 루프 이음에서 꺾이지 않는다. 들숨 몫은 줄의 설정(`smooth_inhale`)에서 받는다 — 여기 기본값이 있으면
    기록이 말하는 것과 다른 곡선이 조용히 나온다."""
    t = t % 1.0
    g = 0.5 * t / inhale if t < inhale else 0.5 + 0.5 * (t - inhale) / (1.0 - inhale)
    return 0.5 - 0.5 * math.cos(2.0 * math.pi * g)


def smooth_inhale(cfg: dict) -> float:
    """smooth 줄의 들숨 몫 — 설정의 `inhale` (생략이면 기본값, 다른 모양 값과 같다)."""
    return _shape(cfg)["inhale"]


def smooth_shoulder_wave(t: float, lag: float, inhale: float) -> float:
    """어깨의 호흡 — 가슴보다 `lag` 만큼 늦게 정점에 닿되 위상 0 과 1 에서는 가슴과 같이 0.

    `wave(t - lag)` 로 늦추면 위상 0 에서 어깨가 아직 날숨 끝에 걸려 있어 첫 칸이 원본이 아니게
    된다. 시간을 `t - lag·sin(πt)` 로 휘면 양 끝은 그대로 두고 가운데만 늦출 수 있다 (lag < 1/π
    이면 단조라 되감기지 않는다)."""
    t = t % 1.0
    return smooth_wave(t - lag * math.sin(math.pi * t), inhale)


def smooth_band(anat: Anatomy) -> tuple[float, float]:
    """(강체 경계, 목 밴드 끝) — 콘텐츠 bbox 기준 행. 그 사이가 목 밴드다: 경계에서 0 이던 움직임이
    여기서 켜진다(목 너비 안은 밴드 끝까지 천천히). 폭은 pixel 테이퍼의 전폭(경계 위아래 각 TAPER)이고
    전부 경계 **아래**에 둔다 — 경계 위(목·턱 위)는 한 픽셀도 움직이지 않아야 한다."""
    top = float(anat.rigid_row)
    return top, top + 2.0 * max(1.5, TAPER * anat.height)


def smooth_shoulder_row(anat: Anatomy) -> float:
    """어깨선 (콘텐츠 bbox 기준 행) — 어깨 혹의 가운데, 목 밴드의 위 4할."""
    top, end = smooth_band(anat)
    return top + 0.4 * (end - top)


def _neck(anat: Anatomy) -> tuple[float, float]:
    """(목 가운데 열, 목 반폭) — 해부가 강체 경계 행에서 잰 구간. 손으로 만든 해부처럼 구간이
    없으면 몸통 축에 몸통 반폭의 1/4 로 둔다."""
    if anat.neck_span is not None:
        lo, hi = anat.neck_span
        return 0.5 * (lo + hi + 1), max(1.0, 0.5 * (hi - lo + 1))
    return anat.axis_x + 0.5, max(1.0, 0.25 * anat.torso_half)


def _shape(cfg: dict) -> dict:
    return {k: (SMOOTH_SHAPE[k] if cfg.get(k) is None else float(cfg[k])) for k in SMOOTH_SHAPE}


def smooth_chest(anat: Anatomy, cfg: dict) -> tuple[float, float]:
    """가슴 타원의 가운데 (콘텐츠 bbox 기준 x, y) — 몸통 축에서 `chest_x` × 몸통 반폭, 목 아래 몸통의
    `chest_y` 비율 높이."""
    shape = _shape(cfg)
    top = float(anat.rigid_row)
    return anat.axis_x + 0.5 + shape["chest_x"] * anat.torso_half, top + shape["chest_y"] * (anat.height - top)


def _chest_frame(anat: Anatomy, cfg: dict) -> tuple[float, float, float, float, float, float]:
    """(가운데 x, y, 가로 반지름, 세로 반지름, cos 기울기, sin 기울기) — 가슴 타원."""
    shape = _shape(cfg)
    cx, cy = smooth_chest(anat, cfg)
    tilt = math.radians(shape["chest_tilt"])
    top = float(anat.rigid_row)
    return (cx, cy, shape["chest_rx"] * anat.torso_half, shape["chest_ry"] * (anat.height - top),
            math.cos(tilt), math.sin(tilt))


def smooth_chest_peak(anat: Anatomy, cfg: dict) -> tuple[float, float]:
    """무게의 꼭대기 P (콘텐츠 bbox 기준 x, y) — 타원 가운데에서 긴 축 따라 `chest_bias` × 가로 반지름,
    가로질러 `chest_bias_y` × 세로 반지름. 둘 다 0 이면 가운데다."""
    shape = _shape(cfg)
    cx, cy, rx, ry, cos_t, sin_t = _chest_frame(anat, cfg)
    along, across = shape["chest_bias"] * rx, shape["chest_bias_y"] * ry
    return cx + along * cos_t - across * sin_t, cy + along * sin_t + across * cos_t


def _chest_reach(anat: Anatomy, cfg: dict, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """콘텐츠 bbox 기준 점 (x, y) 가 가슴 타원 안에서 놓인 몫 — 꼭대기 P 에서 0, 테두리에서 1, 넘으면 밖. 꼭대기가 타원
    가운데면 타원 반지름 그대로, 옮겨졌으면 P 에서 이 점을 지나 테두리에 닿는 반직선 위의 몫이다 (가까운 쪽은 짧은
    거리에서, 돌아간 쪽은 긴 거리에서 1 에 닿는다). smooth 의 가슴 무게와 pixel 의 둥근 가슴이 이 한 식이다."""
    shape = _shape(cfg)
    cx, cy, rx, ry, cos_t, sin_t = _chest_frame(anat, cfg)
    along = (x - cx) * cos_t + (y - cy) * sin_t
    across_axis = (y - cy) * cos_t - (x - cx) * sin_t
    u, v = along / rx, across_axis / ry                     # 타원을 단위원으로 편 좌표
    pu, pv = shape["chest_bias"], shape["chest_bias_y"]
    if pu == 0.0 and pv == 0.0:
        return np.sqrt(u ** 2 + v ** 2)
    du, dv = u - pu, v - pv
    dd = du * du + dv * dv
    pd = pu * du + pv * dv
    reach = (-pd + np.sqrt(pd * pd + dd * (1.0 - pu * pu - pv * pv)))
    return np.where(dd > 0.0, dd / np.maximum(reach, 1e-300), 0.0)


def flat_cos2(r: np.ndarray, flat: float = 0.0) -> np.ndarray:
    """가운데 1 에서 테두리 0 으로 떨어지는 cos² 무게 — `r` 은 가운데에서 테두리까지의 몫(0 가운데, 1 테두리, 넘으면
    밖). `flat` 은 가운데 둘레에서 전량(1)인 몫이고, 남은 길 (r − flat)/(1 − flat) 에서 cos² 로 떨어진다. 가슴 무게
    (chest_flat)와 Sway 레이어 영역의 무게(`video-sway --region` 의 다섯째 값)가 이 한 식이다. `r` 의 자료형을 지킨다."""
    if flat > 0.0:
        r = np.clip((r - flat) / (1.0 - flat), 0.0, None)
    return np.where(r < 1.0, np.cos(0.5 * np.pi * np.minimum(r, 1.0)) ** 2, 0.0)


def smooth_lift(anat: Anatomy, cfg: dict) -> float:
    """smooth 의 가슴이 쉼에서 들숨 꼭대기까지 오르는 px — depth × 기준 높이 (최소·최대 줄은 (height_max - height_min) ×
    기준 높이). Sway 레이어가 숨 박자를 받을 때(`video-sway --breathe`)와 박자 고르기(`--avoid-region`)가 같은 식으로 그
    크기를 읽는다 — 둘 다 쉼에서 움직인 만큼을 본다."""
    return _smooth_amounts(anat, cfg)[1]


def _smooth_depths(cfg: dict) -> tuple[float, float]:
    """smooth 세기 줄의 (depth, depth_x) — 생략은 기본값."""
    return (float(cfg.get("depth") if cfg.get("depth") is not None else DEFAULT_SMOOTH_DEPTH),
            float(cfg.get("depth_x") if cfg.get("depth_x") is not None else DEFAULT_SMOOTH_DEPTH_X))


def _smooth_amounts(anat: Anatomy, cfg: dict) -> tuple[float, float, float, float]:
    """smooth 의 (쉼의 오름 px, 쉼에서 꼭대기까지 오름 px, 쉼의 부풂, 쉼에서 꼭대기까지 부풂) — 곡선 c 에서 가슴은
    쉼 + c × 폭만큼 오르고 부푼다. 세기 줄은 쉼이 0 이고 폭이 depth × 기준 높이·depth_x 다 (위상 0 이 원본 바이트)."""
    bounds = _bounds(cfg)
    if bounds is None:
        depth, swell = _smooth_depths(cfg)
        return 0.0, depth * anat.basis_rows, 0.0, swell
    (w_lo, w_hi), (h_lo, h_hi) = bounds
    return h_lo * anat.basis_rows, (h_hi - h_lo) * anat.basis_rows, w_lo, w_hi - w_lo


def _smoothstep_array(a: float, b: float, x: np.ndarray) -> np.ndarray:
    if b <= a:
        return (x >= b).astype(np.float64)
    u = np.clip((x - a) / (b - a), 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


def smooth_displacement(anat: Anatomy, cfg: dict, x: np.ndarray, y: np.ndarray,
                        chest: float, shoulders: float) -> tuple[np.ndarray, np.ndarray]:
    """콘텐츠 bbox 기준 점 (x, y) 의 내용이 가는 변위 (dx, dy) — 정사상, 위로 오르면 dy < 0.

    가슴: 가운데에 놓인 타원(가로 chest_rx × 몸통 반폭, 세로 chest_ry × 목 아래 몸통, chest_tilt 만큼
    기울임)의 cos² 무게로 `depth × 기준 높이` 만큼 chest_dir 쪽(0 = 바로 위)으로 가고, 그 안이 가운데에서
    바깥으로 `depth_x` 만큼 부푼다. chest_bias 는 무게를 긴 축 따라 한쪽으로 키운다 (몸이 향한 앞쪽).
    어깨: 목 밴드 높이, 몸통 축에서 좌우로 몸통 반폭의 SHOULDER_X 배 자리에 놓인 둥근 혹 둘이
    가슴 오름의 `shoulder` 배만큼 오른다 — 가슴 무게가 이미 덮은 자리는 그만큼 덜 (가운데가 두 번
    오르지 않게). 목과 어깨 사이(옷깃)는 어느 혹에도 안 들어 그대로다.
    고정: 강체 경계 위는 0. 목 너비 안은 목 밴드 전체에 걸쳐 천천히 켜지고(목은 거의 그대로), 그
    밖은 밴드의 0.15 만에(눌림이 행당 상한을 넘지 않는 한) 켜진다 — 목 옆에 높이 붙은 어깨도 숨을
    쉰다. 콘텐츠 맨 아래에서 다시 0 이다 (발바닥 고정)."""
    shape = _shape(cfg)
    top, band_end = smooth_band(anat)
    band = band_end - top
    height = float(anat.height)
    torso = float(anat.torso_half)
    axis = anat.axis_x + 0.5
    neck_x, neck_half = _neck(anat)
    # 몸이 향한 쪽: 타원을 기울이고(chest_tilt), 꼭대기를 앞쪽으로 옮기고(chest_bias, chest_bias_y), 가슴이
    # 가는 쪽을 바로 위에서 돌린다(chest_dir). 모두 0 이면 아래 식은 이 값들이 생기기 전 식과 비트 같다.
    w_chest = flat_cos2(_chest_reach(anat, cfg, x, y), shape["chest_flat"])
    px, py = smooth_chest_peak(anat, cfg)
    heading = math.radians(shape["chest_dir"])
    neckness = 1.0 - _smoothstep_array(neck_half, 1.5 * neck_half, np.abs(x - neck_x))
    across = np.minimum(1.0, np.abs(np.abs(x - axis) - SHOULDER_X * torso) / (SHOULDER_RX * torso))
    down = np.minimum(1.0, np.abs(y - smooth_shoulder_row(anat)) / (1.4 * band))   # 양 어깨 높이가 달라도
    w_shoulder = np.cos(0.5 * np.pi * down) ** 2 * np.cos(0.5 * np.pi * across) ** 2
    rest, lift, rest_swell, swell = _smooth_amounts(anat, cfg)
    # 어깨가 켜지는 구간은 오르는 양(쉼과 꼭대기 중 큰 쪽)의 8배 이상 — 더 짧으면 그 사이가 행당 상한 넘게 눌린다.
    quick = max(0.15 * band, 8.0 * shape["shoulder"] * (lift if rest == 0.0 else max(abs(rest), abs(rest + lift))))
    u = np.clip((y - top) / (quick + (band - quick) * neckness), 0.0, 1.0) if band > quick else \
        np.clip((y - top) / quick, 0.0, 1.0)
    guard = u * u * (3.0 - 2.0 * u) * (1.0 - _smoothstep_array(height - 0.5 * band, height, y))
    rise = lift * (chest * w_chest * math.cos(heading) + shape["shoulder"] * shoulders * w_shoulder * (1.0 - w_chest))
    forward = lift * chest * w_chest * math.sin(heading)
    puff = swell * chest * w_chest
    if rest != 0.0 or rest_swell != 0.0:
        # 최소가 0 이 아닌 줄 — 쉼(곡선 0)에서도 가슴과 어깨가 그만큼 올라(내려) 있고 부풀어(줄어) 있다.
        rise = rise + rest * (w_chest * math.cos(heading) + shape["shoulder"] * w_shoulder * (1.0 - w_chest))
        forward = forward + rest * w_chest * math.sin(heading)
        puff = puff + rest_swell * w_chest
    return (puff * (x - px) + forward) * guard, (puff * (y - py) - rise) * guard


def smooth_strain(anat: Anatomy, cfg: dict) -> tuple[float, float]:
    """(행당 최대 변형, 최소 면적비) — 가슴과 어깨가 함께 정점일 때의 변위장 기울기에서.

    행당 변형은 늘고 주는 성분(∂dx/∂x, ∂dy/∂y)의 최대다 — pixel 의 행당 변형과 같은 뜻. 목 옆에서
    어깨가 오르며 생기는 비틀림(옆 칸끼리 오르는 양의 차)은 늘고 줄지 않으니 여기 세지 않고,
    대신 사상이 접히지 않는지를 면적비 det(I + ∇D) 로 본다."""
    grid = _content_grid(anat)
    if grid is None:
        return 0.0, 1.0
    return _worst(_strain(*smooth_displacement(anat, cfg, *grid, c, c)) for c in _smooth_ends(anat, cfg))


def _smooth_ends(anat: Anatomy, cfg: dict) -> tuple[float, ...]:
    """변형을 잴 곡선 값 — 들숨 꼭대기(1), 최소가 0 이 아닌 줄은 쉼(0)도. 장은 곡선에 대해 일차라 두 끝 밖에서 더 크지 않다."""
    rest, _, rest_swell, _ = _smooth_amounts(anat, cfg)
    return (1.0,) if rest == 0.0 and rest_swell == 0.0 else (0.0, 1.0)


def _worst(strains) -> tuple[float, float]:
    """(행당 최대 변형, 최소 면적비) 여럿 중 가장 나쁜 것 — 큰 변형, 작은 면적비."""
    found = list(strains)
    return max(s for s, _ in found), min(a for _, a in found)


def _content_grid(anat: Anatomy) -> tuple[np.ndarray, np.ndarray] | None:
    """콘텐츠 bbox 의 픽셀 가운데 (x, y) 격자 — 변위장의 기울기를 재는 자리. 한 줄·한 열뿐이면 None."""
    ys = np.arange(anat.height, dtype=np.float64) + 0.5
    xs = np.arange(anat.width, dtype=np.float64) + 0.5
    if ys.size < 2 or xs.size < 2:
        return None
    return np.meshgrid(xs, ys)


def _strain(dx: np.ndarray, dy: np.ndarray, skip: np.ndarray | None = None,
            only: np.ndarray | None = None) -> tuple[float, float]:
    """격자 위 변위장의 (행당 최대 변형, 최소 면적비) — 늘고 주는 성분(∂dx/∂x, ∂dy/∂y)의 최대와 det(I + ∇D) 의 최소.
    `skip` 칸과 그 가로·세로 이웃에서는 재지 않는다 (기울기가 그 칸을 건너 잰 값이다). `only` 를 주면 그 칸에서만 잰다."""
    dxy, dxx = np.gradient(dx)
    dyy, dyx = np.gradient(dy)
    area = (1.0 + dxx) * (1.0 + dyy) - dxy * dyx
    if skip is not None or only is not None:
        keep = np.ones(dx.shape, bool) if only is None else only.copy()
        if skip is not None:
            keep &= ~_widened(skip)
        if not keep.any():
            return 0.0, 1.0
        dxx, dyy, area = dxx[keep], dyy[keep], area[keep]
    stretch = float(max(np.abs(dxx).max(), np.abs(dyy).max()))
    return stretch, float(area.min())


def _widened(mask: np.ndarray) -> np.ndarray:
    """마스크 칸과 그 가로·세로 이웃."""
    out = mask.copy()
    out[1:] |= mask[:-1]
    out[:-1] |= mask[1:]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    return out


def _bilinear(grid: np.ndarray, sx: np.ndarray, sy: np.ndarray) -> np.ndarray:
    """캔버스 격자 값을 캔버스 인덱스 좌표 (sx, sy) 에서 쌍선형으로 — 칸 가운데(정수 좌표)에서는 그 칸 값 그대로."""
    canvas_h, canvas_w = grid.shape
    x0, y0 = np.floor(sx), np.floor(sy)
    ax, ay = sx - x0, sy - y0
    x0c, x1c = np.clip(x0, 0, canvas_w - 1).astype(np.int64), np.clip(x0 + 1, 0, canvas_w - 1).astype(np.int64)
    y0c, y1c = np.clip(y0, 0, canvas_h - 1).astype(np.int64), np.clip(y0 + 1, 0, canvas_h - 1).astype(np.int64)
    return ((grid[y0c, x0c] * (1.0 - ax) + grid[y0c, x1c] * ax) * (1.0 - ay)
            + (grid[y1c, x0c] * (1.0 - ax) + grid[y1c, x1c] * ax) * ay)


def _row_box(anat: Anatomy) -> tuple[int, int, int, int]:
    """줄의 기준 칸이 정한 콘텐츠 자리 (캔버스 좌표) — 고정 칸·쥔 물건을 해부의 격자에 놓을 때 쓴다."""
    if anat.origin is None:
        raise SystemExit("breathe: 고정 칸(--hold-mask)·쥔 물건(--props-mask)은 기준 칸에서 잰 해부의 자리가 있어야 놓인다 — "
                         "기록에서 읽은 해부(breathe.json)에는 그 자리가 없다. 프레임에서 다시 재라.")
    return anat.origin[0], anat.origin[1], anat.origin[0] + anat.width, anat.origin[1] + anat.height


def _smooth_warp(frame: Image.Image, anat: Anatomy, cfg: dict, t: float,
                 pins: "Pins | None" = None) -> Image.Image:
    """smooth 의 한 위상 — 캔버스 크기 불변, 강체 경계 위와 발바닥 고정.

    정사상(원본 점 p 의 내용이 p + D(p) 로 간다)의 역을 고정점 반복(q = o - D(q))으로 풀고, 그
    자리를 곱한 알파에서 쌍선형으로 뜬다. 변위가 행당 상한(MAX_ROW_STRAIN) 아래라 반복은
    수축이다. 움직이지 않는 픽셀(경계 위, 무게 밖)은 원본 바이트를 그대로 둔다 — 곱하고 나누는
    왕복조차 거치지 않는다.

    반복의 첫걸음은 밀림 검사가 이미 잰 D(o) 다. 첫걸음에 제자리(q = o)인 픽셀은 다음 걸음도 D(o) 라
    끝까지 제자리이므로, 둘째 걸음부터는 첫걸음에 움직인 픽셀(무게 띠 안)만 다시 푼다 — 같은 식을
    같은 점에서 재므로 결과가 같다."""
    rgba = frame.convert("RGBA")
    shape = _shape(cfg)
    chest = smooth_wave(t, shape["inhale"])
    shoulders = smooth_shoulder_wave(t, shape["shoulder_lag"], shape["inhale"])
    box = solid_alpha_bbox(rgba)
    rest, _, rest_swell, _ = _smooth_amounts(anat, cfg)
    if not box or (chest == 0.0 and shoulders == 0.0 and rest == 0.0 and rest_swell == 0.0):
        return rgba                                  # 위상 0 — 원본 그대로 (바이트; 최소가 0 인 줄)
    if anat.origin is not None:
        # 줄의 기준 칸에서 잰 자리 — 해부가 한 벌이듯 경계·축·발바닥의 자리도 한 벌이다.
        # 영상 루프는 머리 윗선이 칸마다 흔들려, 칸마다 다시 놓으면 경계 위 행이 움직인다.
        box = (anat.origin[0], anat.origin[1],
               anat.origin[0] + anat.width, anat.origin[1] + anat.height)
    src = np.asarray(rgba)
    canvas_h, canvas_w = src.shape[:2]
    # 움직일 수 있는 행: 강체 경계 아래 ~ 콘텐츠 맨 아래 (그 밖은 변위가 0 이다).
    y_lo = max(0, int(math.floor(box[1] + anat.rigid_row)))
    y_hi = min(canvas_h, box[1] + anat.height)
    if y_hi <= y_lo:
        return rgba
    oy, ox = np.mgrid[y_lo:y_hi, 0:canvas_w].astype(np.float64)
    oy += 0.5 - box[1]                               # 콘텐츠 bbox 기준 픽셀 중심
    ox += 0.5 - box[0]

    def field(x, y):
        if pins is None:
            return smooth_displacement(anat, cfg, x, y, chest, shoulders)
        # 고정 칸에서 0 — 그 칸은 제자리에서 제 바이트를 그대로 뜬다
        return _pinned(pins, box, x, y, *smooth_displacement(anat, cfg, x, y, chest, shoulders))

    # 밀려 나가는 내용 — 원본 픽셀 중심이 가는 자리가 캔버스 밖이면 조용히 자르지 않는다.
    fx, fy = field(ox, oy)
    land_x, land_y = ox + fx + box[0], oy + fy + box[1]
    gone = (land_x < 0.0) | (land_x >= canvas_w) | (land_y < 0.0) | (land_y >= canvas_h)
    clipped = int(np.count_nonzero(src[y_lo:y_hi, :, 3][gone]))
    if clipped:
        raise SystemExit(
            f"breathe(smooth): 가슴 부풂이 불투명 픽셀 {clipped}개를 셀 밖으로 민다 "
            f"(셀 {canvas_w}x{canvas_h}, 콘텐츠 {box[0]},{box[1]}-{box[2]},{box[3]}). "
            f"chest_rx 나 depth_x 를 줄여라 — 기본 모양은 가슴 무게가 몸통 안에서 0 이 된다.")
    qx, qy = ox - fx, oy - fy                        # 첫걸음: q = o - D(o)
    going = (qx != ox) | (qy != oy)
    gx, gy = ox[going], oy[going]
    wx, wy = qx[going], qy[going]
    for _ in range(7):
        dx, dy = field(wx, wy)
        wx, wy = gx - dx, gy - dy
    qx[going], qy[going] = wx, wy
    moved = (qx != ox) | (qy != oy)
    if not moved.any():
        return rgba
    pm = src.astype(np.float64) / 255.0
    pm[..., :3] *= pm[..., 3:4]
    sx = qx[moved] + box[0] - 0.5                    # 캔버스 인덱스 좌표
    sy = qy[moved] + box[1] - 0.5
    x0, y0 = np.floor(sx).astype(np.int64), np.floor(sy).astype(np.int64)
    ax, ay = (sx - x0)[:, None], (sy - y0)[:, None]
    x0c, x1c = np.clip(x0, 0, canvas_w - 1), np.clip(x0 + 1, 0, canvas_w - 1)
    y0c, y1c = np.clip(y0, 0, canvas_h - 1), np.clip(y0 + 1, 0, canvas_h - 1)
    val = ((pm[y0c, x0c] * (1.0 - ax) + pm[y0c, x1c] * ax) * (1.0 - ay)
           + (pm[y1c, x0c] * (1.0 - ax) + pm[y1c, x1c] * ax) * ay)
    alpha = val[:, 3:4]
    rgb = np.where(alpha > 0.0, val[:, :3] / np.maximum(alpha, 1e-12), 0.0)
    out = src.copy()
    region = out[y_lo:y_hi]
    region[moved] = np.clip(np.floor(np.concatenate([rgb, alpha], axis=1) * 255.0 + 0.5), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _smooth_refusals(cfg: dict, anat: Anatomy, pins: "Pins | None" = None) -> None:
    """smooth 줄이 굽기 전에 거부되는 까닭 — 해부와 설정(과 고정 칸)에만 달려 줄에 한 번 본다."""
    lag = cfg.get("lag")
    if lag is not None and float(lag) != 0.0:
        # 진행파는 윗행 위상을 늦춰 위상 0 인 칸도 움직인다 — 조용히 버리지 않는다.
        raise SystemExit(f"breathe(smooth): lag {lag} — smooth 에는 진행파가 없다. 위상 0 인 칸이 원본 "
                         f"그대로여야 루프·묶음 이음이 안 바뀐다. lag 를 지워라 (어깨가 늦는 건 shoulder_lag).")
    grid = _content_grid(anat)
    if pins is None or grid is None:
        strain, area = smooth_strain(anat, cfg)
    else:
        strain, area = _worst(_pinned_strain(anat, pins, *smooth_displacement(anat, cfg, *grid, c, c))
                              for c in _smooth_ends(anat, cfg))
    if strain > MAX_ROW_STRAIN or area < 1.0 - MAX_ROW_STRAIN:
        size = "depth·depth_x" if _bounds(cfg) is None else "height_*·width_*"
        raise SystemExit(
            f"breathe(smooth): 행당 변형 {strain:.3f}·최소 면적비 {area:.3f} — 상한 {MAX_ROW_STRAIN} 을 넘는다. "
            f"가슴·어깨가 오르는 만큼을 목 밴드와 가슴 무게가 못 받는다 (강체 경계 {anat.rigid_row}/{anat.height}, "
            f"기준 {anat.basis_rows}행). {size} 를 줄이거나 chest_rx·chest_ry 를 넓혀라. 조용히 깎지 않는다.")


def _pinned_strain(anat: Anatomy, pins: "Pins", dx: np.ndarray, dy: np.ndarray) -> tuple[float, float]:
    """콘텐츠 격자 위 변위장에 고정 칸·쥔 물건을 얹은 장의 (행당 최대 변형, 최소 면적비) — 몸의 장만 잰다. 몸(고정 칸도 쥔
    물건도 아닌 불투명 칸)과 그 둘레 한 칸에서 재고, 고정 칸·쥔 물건 조각과 그 이웃은 뺀다: 조각은 통째로 옮겨지고 고정 칸은
    맨 위에 그대로 놓여, 둘이 맞닿은 자리의 끊김은 접힘이 아니라 조각이 고정 칸 밑으로 들어가거나 거기서 나오는 것이다. 빈
    칸끼리 늘고 주는 것(칼날 밑 허공이 칼을 따라가다 몸의 장으로 돌아오는 길)은 보이는 것이 없어 세지 않는다."""
    gx, gy = _content_grid(anat)
    box = _row_box(anat)
    rows, cols = slice(box[1], box[3]), slice(box[0], box[2])
    held, piece = pins.hold[rows, cols], pins.props[rows, cols] > 0
    near_held, near_piece = held, piece               # 고정 칸과 조각의 통째 둘레(GRIP)가 2 px 안에서 맞닿는 몸 — 그 사이가
    for _ in range(2):                                # 조각과 같이 가는 칸과 제자리 칸을 잇는 이음이다
        near_held = _widened(near_held)
    for _ in range(int(GRIP) + 2):
        near_piece = _widened(near_piece)
    skip = held | piece | (near_held & near_piece)
    return _strain(*_pinned(pins, box, gx, gy, dx, dy), skip, _widened(pins.body[rows, cols]))


# ── 고정 칸과 쥔 물건 (--hold-mask, --props-mask, --props-behind-mask) ─
#
# 고정 칸: 사람이 준 마스크의 칸은 모든 칸에서 그 칸의 바이트 그대로다. 굽기가 덮어 되돌리는 게 아니라 변위장 자체가 고정
# 칸에서 0 이다 — 그 칸의 내용은 다른 데로 가지 않는다. 장은 고정 칸에서 그 줄을 따라(가로 성분은 같은 행, 세로 성분은 같은
# 열) 멀어지며 다시 켜져, 줄의 몸(고정 칸·쥔 물건이 아닌 불투명 칸)이 가장 크게 움직이는 px 의 REACH 배를 지나면 온전하다. 같은 줄로 재니 고정 칸 옆을 나란히 지나는
# 움직임(고정된 다리 위 몸통의 가로 부풂)은 줄지 않고, 고정 칸 쪽으로 밀거나 거기서 멀어지는 움직임만 준다 — 그보다 짧으면
# 그 사이가 행당 상한 넘게 눌리거나 늘어난다.
# 쥔 물건: 팔이 쥔 것(칼·방패 — 사람이 준 마스크의 8-이웃 조각 하나하나)은 그 조각이 놓인 쪽의 팔과 같이 `arms_x` 만큼
# 가로로 통째 옮겨진다 (늘지 않는다). 조각 둘레 GRIP px 안의 몸(쥔 손·팔)은 정확히 같은 칸만큼 옮겨져 손과 손잡이 사이가
# 벌어지거나 겹치지 않고, 거기서 몸의 장과 다른 px 의 REACH 배에 걸쳐 몸의 장으로 돌아간다. 고정 칸은 쥔 물건 옆에서도 제자리고,
# 조각이 고정 칸 쪽으로 가면 고정 칸 밑으로 들어간다. 마스크를 색으로 묶으면(`row_pins` 의 무리 번호) 한 색의 조각들은 같은
# 칸만큼 간다 — 손에 안 닿은 물속 반사가 칼을 따라간다.
# 몸 뒤 물건(`--props-behind-mask` — 등 뒤에 건 방패): 같은 길로 옮겨지되 몸이 그 앞에 있다. 둘레의 몸은 따라가지 않고, 조각이
# 몸 뒤에서 빠져나온 자리에는 몸 뒤에 가려 있던 조각의 나머지가 나온다.
# 장부: 조각을 놓을 때는 출력 칸마다 보이는 원본 칸(출처 지도)을 들고, 조각마다 칸마다 제자리에 그린 칸·가려진 칸·지어낸
# 칸(떠난 자리로 늘어난 칸)을 거기서 읽어 그린 칸과 가려진 칸의 합이 조각의 칸 수와 맞는지 본다 (`_piece_ledger`). 셀 밖으로
# 가는 조각 칸, 한 층의 두 조각이 한 칸에 놓이는 것, 몸 뒤 조각과 몸이 떨어져 생기는 구멍은 거부한다 — 칸을 조용히 버리거나
# 조용히 지어내지 않는다.
# 고정 칸 둘레·쥔 물건 둘레·팔 몫·오르는 몫이 켜지는 길은 미는 px 의 REACH 배다 — 켜지는 길의 늘어남이 많아야 1.5 / REACH 라,
# 가슴 타원 안의 늘어남(기준 가슴에서 0.1 남짓)과 한 자리에 겹쳐도 합이 행당 상한 아래에 남는다.
REACH = 12.0
GRIP = 2.0
# 옆으로 미끄러지는 몫이 켜지는 줄 수의 하한 — 미는 px 의 이 배 (smoothstep 의 가장 가파른 기울기가 1.5 / 길이라, 한 줄에 한
# 칸 넘게 미끄러지지 않는다).
SHEAR = 1.5


@dataclass(frozen=True, eq=False)
class Pins:
    """줄의 고정 칸·쥔 물건이 정한 캔버스 격자 (`row_pins` — 줄에 한 번 잰다)."""

    hold: np.ndarray       # bool — 고정 칸
    props: np.ndarray      # int — 쥔 물건 조각 번호 (0 = 아님, 1 부터 맨 위 칸 순 — 몸 앞·몸 뒤 조각이 한 줄)
    shifts: np.ndarray     # float — 조각 번호마다 들숨 꼭대기의 가로 px (0 번은 0, 한 무리의 조각은 같은 px)
    behind: np.ndarray     # bool — 조각 번호마다 몸 뒤인가 (0 번은 False)
    colours: tuple         # 조각 번호마다 무리의 마스크 색 "#rrggbb" — 색으로 묶지 않았으면 None (0 번도 None)
    wx: np.ndarray         # float — 가로 성분에 곱하는 고정 무게 (고정 칸 0)
    wy: np.ndarray         # float — 세로 성분에 곱하는 고정 무게
    grip: np.ndarray       # float — 몸의 장이 몸 앞 조각들의 움직임을 따르는 몫 (조각 위와 둘레 GRIP px 는 1, 몸 뒤 조각은 끌지 않는다)
    grip_dx: np.ndarray    # float — 그 몫으로 섞은 조각들의 가로 px (조각 위와 둘레 GRIP px 는 그 조각의 px)
    body: np.ndarray       # bool — 몸: 기준 칸의 불투명 칸 가운데 고정 칸도 쥔 물건도 아닌 칸 (행당 변형을 재는 자리)

    def pieces(self, hidden: list[list[int]] | None = None, behind: bool = False,
               filled: list[list[int]] | None = None) -> list[dict]:
        """한 마스크(몸 앞, `behind` 면 몸 뒤)의 조각마다 칸 수, 들숨 꼭대기의 가로 px, 색으로 묶었으면 그 색 — breathe.json
        `props.pieces`·`props_behind.pieces`. `hidden`·`filled` (칸마다 조각 번호 순의 가려진 칸 수·지어낸 칸 수,
        `_piece_ledger`)를 주면 조각마다 칸마다의 수 `hidden`·`filled` 와 그 최대 `hidden_max`·`filled_max` 도."""
        rows = []
        for k in range(1, len(self.shifts)):
            if bool(self.behind[k]) != behind:
                continue
            row = {"cells": int(np.count_nonzero(self.props == k)), "shift_px": round(float(self.shifts[k]), 4)}
            if self.colours[k] is not None:
                row["colour"] = self.colours[k]
            for key, counts in (("hidden", hidden), ("filled", filled)):
                if counts is not None:
                    row[key] = [int(frame[k - 1]) for frame in counts]
                    row[f"{key}_max"] = max(row[key], default=0)
            rows.append(row)
        return rows


def _line_reach(mask: np.ndarray, axis: int) -> np.ndarray:
    """`mask` 칸까지 한 줄(axis 1 = 같은 행, 0 = 같은 열)을 따라 잰 거리 — 그 줄에 하나도 없으면 inf."""
    m = np.moveaxis(np.asarray(mask, bool), axis, -1)
    idx = np.arange(m.shape[-1], dtype=np.float64)
    before = np.maximum.accumulate(np.where(m, idx, -np.inf), axis=-1)
    after = np.minimum.accumulate(np.where(m, idx, np.inf)[..., ::-1], axis=-1)[..., ::-1]
    return np.moveaxis(np.minimum(idx - before, after - idx), -1, axis)


def _shifted(a: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """`a` 를 (dy, dx) 칸 민 격자 — 밖에서 들어온 칸은 0."""
    out = np.zeros_like(a)
    h, w = a.shape
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = a[max(0, -dy):h + min(0, -dy), max(0, -dx):w + min(0, -dx)]
    return out


NEIGHBOURS = ((1, 0), (-1, 0), (0, 1), (0, -1))
DIAGONALS = ((1, 1), (1, -1), (-1, 1), (-1, -1))


def _pieces(mask: np.ndarray, join: int = 0) -> np.ndarray:
    """마스크의 8-이웃 조각 번호 격자 — 0 = 아님, 조각은 맨 위(같으면 맨 왼쪽) 칸 순으로 1 부터. `join` px 안에 떨어진
    칸들은 한 조각이다 (쥔 손 칸이 사이에 끼어 갈라진 칼자루와 칼날처럼)."""
    mask = np.asarray(mask, bool)
    if join > 0:
        grown = mask.copy()
        for _ in range(join):
            wider = grown.copy()
            for dy, dx in NEIGHBOURS + DIAGONALS:
                wider |= _shifted(grown, dy, dx)
            grown = wider
        joined = _pieces(grown)
        roots = np.unique(joined[mask])
        labels = np.zeros(mask.shape, np.int64)
        labels[mask] = np.searchsorted(roots, joined[mask]) + 1
        return labels
    seed = np.where(mask, np.arange(1, mask.size + 1).reshape(mask.shape), 0)
    while True:                                      # 조각 안에서 가장 작은 칸 번호로 모은다
        low = seed.copy()
        for dy, dx in NEIGHBOURS + DIAGONALS:
            near = _shifted(seed, dy, dx)
            low = np.where(mask & (near > 0) & (near < low), near, low)
        if np.array_equal(low, seed):
            break
        seed = low
    roots = np.unique(seed[mask])                    # 가장 작은 칸 번호 = 맨 위·맨 왼쪽 칸 → 그 순서
    labels = np.zeros(mask.shape, np.int64)
    labels[mask] = np.searchsorted(roots, seed[mask]) + 1
    return labels


def _distance_to(mask: np.ndarray, reach: float) -> np.ndarray:
    """칸 가운데에서 `mask` 의 가장 가까운 칸 가운데까지의 곧은 거리 — `reach` 넘게 떨어진 칸은 `reach`. 계단 거리(팔각)로
    재면 한 칸 사이에 두 걸음씩 뛰는 자리가 생겨 그 위에 얹은 무게의 기울기가 두 배가 된다."""
    mask = np.asarray(mask, bool)
    out = np.full(mask.shape, float(reach))
    if not mask.any():
        return out
    out[mask] = 0.0
    inner = mask.copy()                              # 테두리 칸만 재면 된다 — 안쪽 칸은 테두리보다 멀다
    inner[1:] &= mask[:-1]
    inner[:-1] &= mask[1:]
    inner[:, 1:] &= mask[:, :-1]
    inner[:, :-1] &= mask[:, 1:]
    by, bx = np.nonzero(mask & ~inner)
    pad = int(math.ceil(reach))
    y0, y1 = max(0, int(by.min()) - pad), min(mask.shape[0], int(by.max()) + pad + 1)
    x0, x1 = max(0, int(bx.min()) - pad), min(mask.shape[1], int(bx.max()) + pad + 1)
    gy, gx = np.mgrid[y0:y1, x0:x1]
    near = np.full(gy.shape, np.inf)
    for i in range(0, by.size, 256):                 # 테두리 칸 묶음마다 — 메모리를 묶음 크기로 묶어 둔다
        d = np.hypot(gy[..., None] - by[None, None, i:i + 256], gx[..., None] - bx[None, None, i:i + 256])
        near = np.minimum(near, d.min(axis=-1))
    region = out[y0:y1, x0:x1]
    region[...] = np.where(mask[y0:y1, x0:x1], 0.0, np.minimum(near, reach))
    return out


def read_mask(path: str | Path, size: tuple[int, int], flag: str,
              colours: bool = False) -> tuple[np.ndarray, dict]:
    """마스크 PNG 를 읽는다 — 밝은(명도 128 이상) 불투명(알파 128 이상) 칸이 그 마스크의 칸이다. 프레임과 같은 크기여야
    하고, 칸이 하나도 없으면 조용히 넘기지 않고 거부한다. (마스크, breathe.json 에 실을 기록).
    `colours` 면 마스크는 bool 이 아니라 칸마다 그 색의 무리 번호다 (0 = 칸 아님, 색 0xRRGGBB + 1 — 두 마스크에서 같은 색은 같은
    번호) — 기록에 색 수 `colours` 가 더 실린다."""
    path = Path(path)
    try:
        data = path.read_bytes()
        with Image.open(path) as im:
            la = np.asarray(im.convert("LA"))
            rgb = np.asarray(im.convert("RGB")) if colours else None
    except OSError as exc:
        raise SystemExit(f"breathe: {flag} {path} 를 못 읽는다 ({exc})")
    if (la.shape[1], la.shape[0]) != tuple(size):
        raise SystemExit(f"breathe: {flag} {path} 는 {la.shape[1]}x{la.shape[0]} 인데 프레임은 {size[0]}x{size[1]} 이다 — "
                         f"같은 크기여야 칸이 맞는다.")
    mask = (la[..., 0] >= 128) & (la[..., 1] >= 128)
    if not mask.any():
        raise SystemExit(f"breathe: {flag} {path} 에 칸(밝은 불투명 칸)이 하나도 없다 — 흰 칸이 그 마스크의 칸이다.")
    record = {"path": str(path), "sha256": hashlib.sha256(data).hexdigest(), "cells": int(mask.sum())}
    if rgb is None:
        return mask, record
    rgb = rgb.astype(np.int64)
    groups = np.where(mask, (rgb[..., 0] << 16 | rgb[..., 1] << 8 | rgb[..., 2]) + 1, 0)
    record["colours"] = int(np.unique(groups[mask]).size)
    return groups, record


def _held_pieces(front: np.ndarray, back: np.ndarray) -> tuple[np.ndarray, list, list[bool]]:
    """몸 앞(`front`)·몸 뒤(`back`) 마스크의 (조각 번호 격자, 조각마다 무리 열쇠, 조각마다 몸 뒤인가). 조각은 한 마스크의 한
    무리 안에서 8-이웃으로 잇고 GRIP px 안에 떨어진 칸도 한 조각이다 (`_pieces`). bool 마스크는 조각마다 제 무리고, 무리 번호
    격자(int)는 같은 번호의 조각들이 한 무리다 — 두 마스크에 걸쳐서도. 번호는 두 마스크를 함께 맨 위(같으면 맨 왼쪽) 칸 순."""
    found = []
    for behind, grid in ((False, front), (True, back)):
        grid = np.asarray(grid)
        if grid.dtype == bool:
            parts = [(("piece", behind), grid)]
        else:
            parts = [(("colour", int(g)), grid == g) for g in np.unique(grid[grid != 0])]
        for key, mask in parts:
            labels = _pieces(mask, int(GRIP))
            for k in range(1, int(labels.max()) + 1):
                cells = labels == k
                found.append((int(np.flatnonzero(cells)[0]), cells, key if key[0] == "colour" else (key, k), behind))
    found.sort(key=lambda f: f[0])
    labels = np.zeros(np.shape(front), np.int64)
    for k, (_, cells, _, _) in enumerate(found, 1):
        labels[cells] = k
    return labels, [f[2] for f in found], [f[3] for f in found]


def row_pins(anat: Anatomy, cfg: dict, frame: Image.Image, hold: np.ndarray | None = None,
             props: np.ndarray | None = None, behind: np.ndarray | None = None) -> Pins | None:
    """줄의 고정 칸(`hold`, 캔버스 크기 bool)·쥔 물건(`props`)·몸 뒤 물건(`behind`) 마스크를 변위장에 얹을 격자로 — 셋 다 없으면
    None. `props`·`behind` 는 bool(조각마다 제 손을 따른다)이거나 무리 번호 격자다 (int, 0 = 아님 — `read_mask(..., colours=True)`
    의 색: 한 번호의 조각들은 두 마스크에 걸쳐 같은 칸만큼 간다). `frame` 은 줄의 기준 칸이다 (쥔 물건이 몸에 닿은 자리를 읽는다).

    쥔 물건 조각은 쥔 팔과 같이 간다: 조각의 무리가 몸(고정 칸·쥔 물건이 아닌 불투명 칸)에 닿은 칸들에서 읽은 가슴의 가로 몫의
    평균에, 무리 가운데가 놓인 쪽 팔의 몫(`arms_x` × 기준 높이 px, 몸 바깥쪽)을 다 더한 만큼 — 쥔 손이 가슴에 밀리는 만큼과
    팔이 벌어지는 만큼이다. 몸에 닿은 칸이 없으면 무리 전체에서 읽는다 — 손에 안 닿은 반사는 칼과 한 무리로 묶어야 칼을 따른다.
    몸 앞 조각은 둘레 GRIP px 의 몸을 끌고 가고(쥔 손이 손잡이와 같이 간다), 몸 뒤 조각은 장에 얹지 않는다 — 몸이 그 앞에서 몸의
    장을 따르고, 조각은 `_place_pieces` 가 통째로 놓는다.
    봉투 스쿼시 줄은 가로줄을 통째로 옮겨 칸 하나를 제자리에 둘 수 없으니 받지 않고, 쥔 물건은 팔과 같이 가니 pixel 의
    둥근 가슴에 `arms_x` 가 있어야 받는다. 한 칸이 두 마스크에 있을 수 없다 — 조용히 한쪽을 고르지 않는다."""
    if hold is None and props is None and behind is None:
        return None
    w, h = frame.size
    masks = {}
    for flag, mask in (("--hold-mask", hold), ("--props-mask", props), ("--props-behind-mask", behind)):
        if mask is None:
            masks[flag] = np.zeros((h, w), bool)
            continue
        mask = np.asarray(mask)
        if (mask.shape[1], mask.shape[0]) != (w, h):
            raise SystemExit(f"breathe: {flag} 는 {mask.shape[1]}x{mask.shape[0]} 인데 프레임은 {w}x{h} 이다 — 같은 크기여야 "
                             f"칸이 맞는다.")
        masks[flag] = mask if mask.dtype != bool and flag != "--hold-mask" else mask.astype(bool)
    hold, front, back = masks["--hold-mask"], masks["--props-mask"], masks["--props-behind-mask"]
    smooth, rounded = breathe_mode(cfg) == BREATHE_SMOOTH, pixel_round(cfg)
    if not (smooth or rounded):
        raise SystemExit("breathe: 고정 칸(--hold-mask)·쥔 물건(--props-mask, --props-behind-mask)은 변위장으로 굽는 줄의 것이다 — "
                         "mode smooth, 또는 pixel 의 둥근 가슴(chest_round·arms_x). pixel 봉투 스쿼시는 가로줄을 통째로 옮겨 칸을 "
                         "제자리에 둘 수 없다.")
    if (front.any() or back.any()) and not (rounded and cfg.get("arms_x")):
        raise SystemExit("breathe: 쥔 물건(--props-mask, --props-behind-mask)은 팔과 같이 가로로 옮겨진다 — pixel 의 둥근 가슴에 "
                         "arms_x 를 주라.")
    for one, two, names in ((hold, front != 0, "고정 칸이면서 쥔 물건"), (hold, back != 0, "고정 칸이면서 몸 뒤 물건"),
                            (front != 0, back != 0, "쥔 물건이면서 몸 뒤 물건")):
        both = int(np.count_nonzero(one & two))
        if both:
            raise SystemExit(f"breathe: {both} 칸이 {names}이다 — 한 칸은 하나만 된다. 두 마스크 중 하나에서 빼라.")
    held = (front != 0) | (back != 0)
    box = _row_box(anat)
    grid = _content_grid(anat)
    moving = (np.asarray(frame.convert("RGBA"))[..., 3] >= 128) & ~hold & ~held
    moving = moving[box[1]:box[3], box[0]:box[2]]
    if grid is None or not moving.any():
        biggest = 0.0
    else:
        dx, dy = smooth_displacement(anat, cfg, *grid, 1.0, 1.0) if smooth else round_displacement(anat, cfg, *grid)
        biggest = float(np.hypot(dx, dy)[moving].max())   # 몸이 가장 크게 움직이는 px — 빈 칸·고정 칸·쥔 물건은 안 센다
    reach = max(2.0, REACH * biggest)
    wx = _smoothstep_array(0.0, reach, np.minimum(_line_reach(hold, 1), reach))
    wy = _smoothstep_array(0.0, reach, np.minimum(_line_reach(hold, 0), reach))
    labels, keys, behinds = _held_pieces(front, back)   # 쥔 손 칸이 사이에 낀 한 물건의 조각들은 한 조각
    arms = float(cfg.get("arms_x") or 0.0) * anat.basis_rows
    axis = box[0] + anat.axis_x + 0.5                 # 캔버스 좌표의 몸통 축
    body = (np.asarray(frame.convert("RGBA"))[..., 3] >= 128) & ~hold & (labels == 0)
    touch = body.copy()                               # 몸 칸과 그 가로·세로 이웃
    touch[1:] |= body[:-1]
    touch[:-1] |= body[1:]
    touch[:, 1:] |= body[:, :-1]
    touch[:, :-1] |= body[:, 1:]

    def reads(cells: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """(행, 열, 가슴의 가로 몫, 팔의 가로 몫) — 칸들이 몸에 닿은 자리에서 (닿은 칸이 없으면 칸 전체에서)."""
        ys, xs = np.nonzero(cells & touch) if (cells & touch).any() else np.nonzero(cells)
        chest, _, arm = (_round_parts(anat, cfg, xs + 0.5 - box[0], ys + 0.5 - box[1]) if rounded
                         else (np.zeros(1), None, np.zeros(1)))
        return ys, xs, chest, arm

    moves = {}                                        # 무리마다 들숨 꼭대기의 가로 px
    for key in dict.fromkeys(keys):
        cells = np.isin(labels, [k for k, g in enumerate(keys, 1) if g == key])
        side = -1.0 if np.nonzero(cells)[1].mean() + 0.5 < axis else 1.0   # 무리 가운데가 놓인 쪽의 팔 쪽으로
        moves[key] = float(np.mean(reads(cells)[2])) + side * arms
    shifts = np.asarray([0.0] + [moves[key] for key in keys])
    weight = np.zeros((h, w))                         # 조각들이 몸의 장을 끄는 몫의 합
    pull = np.zeros((h, w))                           # 그 몫마다 조각의 가로 px 를 곱한 합
    for k in range(1, len(shifts)):
        piece = labels == k
        if behinds[k - 1]:
            continue                                  # 몸 뒤 조각은 몸을 끌지 않는다 — 장은 그 칸에서도 몸의 장이다 (`_place_pieces`)
        else:
            # 조각 둘레의 몸이 조각을 따라가는 길 — 닿은 자리에서 몸의 장(고정 칸 둘레에서 준 그대로)과 조각의 px 가 다른 만큼의
            # REACH 배. 조각이 가는 만큼이 아니라 몸과 다른 만큼이라, 가슴이 이미 미는 옆구리에 붙은 방패·칼은 짧은 길로 따라간다.
            ys, xs, chest, arm = reads(piece)
            ramp = max(2.0, REACH * float(np.abs(shifts[k] - wx[ys, xs] * (chest + arm)).max()))
            near = 1.0 - _smoothstep_array(GRIP, GRIP + ramp, _distance_to(piece, GRIP + ramp))
        weight += near
        pull += near * shifts[k]
    # 길이 겹친 자리(두 조각 사이의 몸)는 섞는다 — 가장 가까운 조각으로 갈라 끊지 않는다. 조각 위와 둘레 GRIP px 는 그 조각
    # 하나의 몫이 1 이라 정확히 그 조각의 px 다.
    grip = np.minimum(weight, 1.0)
    grip_dx = np.where(weight > 0.0, pull / np.maximum(weight, 1e-12), 0.0)   # 조각들의 px 를 몫으로 고르게 — 한 조각이면 그 조각의 px
    # 머리(강체 경계 위)는 쥔 물건 옆에서도 제자리다 — 옆으로 가는 몫처럼 켜되, 조각이 가는 px 의 SHEAR 배 줄보다 짧지 않게: 더
    # 짧으면 머리선 밑의 줄이 한 줄에 한 칸 넘게 미끄러져, 머리선을 지나 내려오는 윤곽(어깨선)이 끊긴다.
    top, band_end = smooth_band(anat)
    rows = np.arange(h, dtype=np.float64) + 0.5 - box[1]
    turn = max(0.15 * (band_end - top), SHEAR * float(np.abs(shifts).max(initial=0.0)))
    grip *= _smoothstep_array(top, top + turn, rows)[:, None]
    grip[hold] = 0.0                                  # 고정 칸은 쥔 물건 옆에서도 제자리다
    colours = tuple([None] + [f"#{key[1] - 1:06x}" if key[0] == "colour" else None for key in keys])
    return Pins(hold=hold, props=labels, shifts=shifts, behind=np.asarray([False] + behinds), colours=colours, wx=wx,
                wy=wy, grip=grip, grip_dx=grip_dx, body=body)


def _pinned(pins: Pins | None, box, x: np.ndarray, y: np.ndarray, dx: np.ndarray,
            dy: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """콘텐츠 bbox 기준 점 (x, y) 의 변위 (dx, dy) 에 고정 칸·쥔 물건을 얹는다 — 고정 칸 쪽 줄로 준 몸의 장을 쥔 물건 둘레에서
    그 조각의 가로 px 로 섞는다. 고정 칸 가운데에서 몸의 장은 정확히 0, 조각 위와 둘레 GRIP px 에서는 정확히 그 조각의 px."""
    if pins is None:
        return dx, dy
    sx, sy = x + box[0] - 0.5, y + box[1] - 0.5
    grip = _bilinear(pins.grip, sx, sy)
    return ((1.0 - grip) * _bilinear(pins.wx, sx, sy) * dx + grip * _bilinear(pins.grip_dx, sx, sy),
            (1.0 - grip) * _bilinear(pins.wy, sx, sy) * dy)


# ── 둥근 가슴 (pixel — chest_round·arms_x) ─────────────────────────
#
# 봉투 스쿼시는 가로줄을 통째로 늘이고 줄인다 — 머리가 몸통 위에서 오르내리고 숨이 줄 단위로 읽힌다. 둥근 가슴은 가슴
# 꼭대기 P 에서 바깥으로 부푸는 2차원 변위장 하나를 정수 칸으로 굽는다: 출력의 칸은 전부 원본 칸 하나를 그대로 옮긴
# 것이다 (사잇값 없음 — 새 색이 없다). 장이 행당 상한 아래라 가로·세로 어느 줄에서도 칸 순서가 뒤집히지 않는다.

def pixel_round(cfg: dict) -> bool:
    """이 줄이 둥근 가슴 장을 굽나 — pixel 이고 `chest_round`·`arms_x` 중 하나가 0 보다 크다 (생략·0 은 봉투 스쿼시)."""
    return breathe_mode(cfg) == BREATHE_PIXEL and bool(cfg.get("chest_round") or cfg.get("arms_x"))


def round_displacement(anat: Anatomy, cfg: dict, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """콘텐츠 bbox 기준 점 (x, y) 의 내용이 들숨 꼭대기에서 가는 변위 (dx, dy) — 정사상, 위로 오르면 dy < 0.

    가슴: 가슴 타원(smooth 와 같은 chest_* 키)의 테두리가 꼭대기 P 에서 바깥으로 `chest_round × 기준 높이` px 나간다.
    타원 안은 P 에서 테두리까지 고르게 늘고, 타원 밖은 같은 px 만큼 통째로 밀린다 — 늘지 않으니 윤곽선이 1 px 로 남는다.
    P 위쪽은 위·옆으로, P 아래쪽은 옆으로만 간다 — 아래로 밀면 서 있는 발이 눌린다.
    팔: 몸통 밖 부속 열(부속 보호가 시작하는 자리 — 사람이 준 몸통 반폭이면 그 반폭, 아니면 그 1.15 배 — 바깥)은 가슴이
    미는 대로 통째로 밀리고(타원 밖이다), 거기에 더해 몸통 축에서 먼 쪽으로 `arms_x × 기준 높이` px 가로로 통째 간다 — 팔은
    늘지 않는다 (pixel 의 "날개·팔은 밀리기만 한다"). 그 몫이 켜지는 길은 팔이 아니라 몸통 쪽에 둔다: 부속 경계 안쪽
    REACH × 그 px 에 걸쳐 몸통 옆구리가 팔을 따라 벌어진다 — 더 짧으면 어깨가 행당 상한 넘게 늘어난다. 해부가 부속을
    못 찾았고 몸통 반폭도 안 줬으면 팔 몫은 없다. 쥔 물건은 `row_pins` 가 얹는다.
    고정: 강체 경계 위는 0 이라 머리가 자리·바이트 그대로다. 강체 경계 아래에서 오르는 몫은 smooth 의 목 밴드처럼 켜지고(목
    너비 안은 밴드 전체에 걸쳐, 그 밖은 오르는 px 의 REACH 배나 밴드의 0.15 만에 — 그보다 짧으면 머리 밑이 행당 상한 넘게
    눌린다), 옆으로 가는 몫은 밴드의 0.15 나 옆으로 가는 px(가슴과 팔)의 SHEAR 배 가운데 긴 쪽에 걸쳐 켜진다 — 옆으로는 머리
    밑을 누르지 않고 비껴 지나갈 뿐이라, 머리가 크고 몸통이 짧은 그림에서도 어깨가 옆으로 숨쉰다. 그보다 짧으면 머리선 밑의 줄이
    한 줄에 한 칸 넘게 미끄러져 머리선을 지나 내려오는 윤곽(어깨선)이 끊긴다. 가로 밀림은 가슴 타원의 아래 테두리에서 콘텐츠
    맨 아래까지 0 으로 줄어든다 — 발은 선 자리에 있다."""
    chest_dx, chest_dy, arm_dx = _round_parts(anat, cfg, x, y)
    return chest_dx + arm_dx, chest_dy


def _round_parts(anat: Anatomy, cfg: dict, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """`round_displacement` 의 몫 셋 — (가슴의 가로, 가슴의 세로, 팔의 가로). 쥔 물건 조각은 가슴의 가로 몫을 몸에 닿은
    자리에서 읽는다 (`row_pins`)."""
    top, band_end = smooth_band(anat)
    band = band_end - top
    basis = float(anat.basis_rows)
    swell = float(cfg.get("chest_round") or 0.0) * basis
    arms = float(cfg.get("arms_x") or 0.0) * basis
    _cx, cy, _rx, ry, _cos, _sin = _chest_frame(anat, cfg)
    px, py = smooth_chest_peak(anat, cfg)
    ox, oy = x - px, y - py
    out = swell * np.minimum(_chest_reach(anat, cfg, x, y), 1.0) / np.maximum(np.hypot(ox, oy), 1e-12)
    away = np.where(x < anat.axis_x + 0.5, -1.0, 1.0)
    neck_x, neck_half = _neck(anat)
    neckness = 1.0 - _smoothstep_array(neck_half, 1.5 * neck_half, np.abs(x - neck_x))
    quick = min(band, max(0.15 * band, REACH * swell))
    rise = _smoothstep_array(0.0, 1.0, (y - top) / (quick + (band - quick) * neckness))
    turn = max(0.15 * band, SHEAR * (swell + arms))
    aside = _smoothstep_array(top, top + turn, y) * (1.0 - _smoothstep_array(cy + ry, float(anat.height), y))
    return ox * out * aside, np.minimum(oy, 0.0) * out * rise, _arm_side(anat, arms, x) * away * arms * aside


def _arm_side(anat: Anatomy, arms: float, x: np.ndarray) -> np.ndarray | float:
    """`round_displacement` 의 팔 몫 무게 (콘텐츠 bbox 기준 점의 x) — 부속 경계 바깥은 1, 안쪽 REACH × 팔 px 에 걸쳐
    0 으로. 부속 경계는 부속 보호(`protect`)가 시작하는 자리다. 팔 몫이 없으면 0."""
    if arms <= 0.0 or not arms_found(anat):
        return 0.0
    start = float(anat.torso_half) * (1.0 if anat.torso_source == "manual" else 1.15)
    reach = min(start, max(2.0, REACH * arms))       # 몸통 축을 넘지 않는다 — 축에서 왼쪽·오른쪽이 갈린다
    return _smoothstep_array(start - reach, start, np.abs(x - 0.5 - anat.axis_x))


def arms_found(anat: Anatomy) -> bool:
    """해부가 몸통 밖 부속(팔)을 읽었나 — 부속 보호와 같은 판정: 사람이 몸통 반폭을 줬거나 실루엣이 몸통보다 넓게 뻗었다."""
    return anat.torso_source == "manual" or anat.has_appendage


def round_strain(anat: Anatomy, cfg: dict, pins: Pins | None = None) -> tuple[float, float]:
    """(행당 최대 변형, 최소 면적비) — 둥근 가슴 장의 들숨 꼭대기(고정 칸·쥔 물건을 얹어)에서."""
    grid = _content_grid(anat)
    if grid is None:
        return 0.0, 1.0
    dx, dy = round_displacement(anat, cfg, *grid)
    return _strain(dx, dy) if pins is None else _pinned_strain(anat, pins, dx, dy)


def _round_refusals(cfg: dict, anat: Anatomy, pins: Pins | None) -> None:
    """둥근 가슴 줄이 굽기 전에 거부되는 까닭 — 해부·설정·고정 칸·쥔 물건에만 달려 줄에 한 번 본다."""
    if cfg.get("arms_x") and not arms_found(anat) and (pins is None or not pins.props.any()):
        raise SystemExit(
            f"breathe(round): arms_x {cfg['arms_x']} — 옮길 팔이 없다: 해부가 몸통 밖 부속을 못 찾았고(실루엣 최대 반폭 "
            f"{anat.max_half} 가 몸통 반폭 {anat.torso_half} 의 1.3 배 아래) 쥔 물건(--props-mask)도 없다. torso_half 로 몸통 "
            f"폭을 주거나, 쥔 물건을 주거나, arms_x 를 지워라. 조용히 넘기지 않는다.")
    strain, area = round_strain(anat, cfg, pins)
    if strain > MAX_ROW_STRAIN or area < 1.0 - MAX_ROW_STRAIN:
        raise SystemExit(
            f"breathe(round): 행당 변형 {strain:.3f}·최소 면적비 {area:.3f} — 상한 {MAX_ROW_STRAIN} 을 넘는다. 가슴이 "
            f"부푸는 만큼을 가슴 타원·목 밴드·고정 칸 둘레가 못 받는다 (강체 경계 {anat.rigid_row}/{anat.height}, 기준 "
            f"{anat.basis_rows}행). chest_round·arms_x 를 낮추거나 chest_rx·chest_ry 를 넓혀라. 조용히 깎지 않는다.")


def piece_step(pins: Pins, piece: int, curve: float) -> int:
    """조각 하나가 이 위상에서 옮겨지는 칸 — 몸을 뜨는 규칙(칸 가운데에서 변위를 빼고 내림)과 같은 반올림이라, 조각 둘레
    GRIP px 의 몸(변위가 정확히 그 조각의 px)과 늘 같은 칸이다."""
    return int(math.ceil(curve * float(pins.shifts[piece]) - 0.5))


def _piece_name(pins: Pins, piece: int) -> tuple[str, int, int]:
    """조각 번호의 (마스크 플래그, 그 마스크에서 몇째, 그 마스크의 조각 수) — breathe.json 의 `pieces` 와 경고 줄이 세는 번호."""
    layer = [k for k in range(1, len(pins.shifts)) if bool(pins.behind[k]) == bool(pins.behind[piece])]
    return ("--props-behind-mask" if pins.behind[piece] else "--props-mask"), layer.index(piece) + 1, len(layer)


def _place_pieces(out: np.ndarray, shows: np.ndarray, src: np.ndarray, pins: Pins, curve: float, came_body: np.ndarray,
                  came_behind: np.ndarray) -> list[int]:
    """쥔 물건 조각을 통째로(`piece_step` 칸) 놓는다 — `_round_warp` 의 장이 이미 뜬 `out` 위에, 그 자리에서. `shows` 는 출력
    칸마다 그 칸이 보이는 원본 칸 번호(-1 = 빈 칸)라, 여기서 쓰는 칸마다 같이 적는다. 조각 번호 순의 옮긴 칸을 돌려준다 — 가려진
    칸과 지어낸 칸은 `_piece_ledger` 가 `shows` 에서 읽는다. `came_body` 는 장이 몸(고정 칸·쥔 물건이 아닌 불투명 칸)을 데려온 출력
    칸, `came_behind` 는 몸 뒤 조각의 칸을 데려온 출력 칸이다 — 몸 뒤 조각은 몸을 끌지 않아 장이 그 칸을 몸의 장으로 옮겨
    놓았으니, 먼저 비우고 아래에서 통째로 다시 그린다 (몸과 그 윤곽은 끊김 없이 몸의 장을 따른다).

    그리기 전에 거부한다 — 조각의 불투명 칸이 셀 밖으로 가면(자르지 않는다), 그리고 한 층(몸 앞끼리, 몸 뒤끼리)의 두 조각이 한
    칸에 놓이면(어느 쪽이 앞인지 마스크가 말하지 않는다 — 조용히 한쪽을 고르지 않는다).
    떠난 칸 — 조각이 옮겨지며 비운 제 칸 — 은 그 줄에서 조각 바로 뒤(옮겨진 쪽의 반대)의 첫 칸을 본다. 몸 앞 조각: 둘레의 몸은
    장이 이미 같은 칸만큼 데려왔다. 바로 뒤가 고정 칸이면 장이 그 칸을 데려올 수 없어(제자리다) 그 고정 칸이 떠난 칸들로
    늘어난다 — 물에 잠긴 칼날이 떠난 자리에 물이, 소매가 떠난 자리에 고정된 등이 온다. 몸 뒤 조각: 앞의 몸은 제자리고, 몸 뒤에
    가려 있던 조각의 나머지가 나온다 — 바로 뒤가 불투명하면 조각이 거기 닿았던 칸이 떠난 칸들로 늘어나고, 비었으면 빈 칸이
    된다. 장이 몸을 데려온 칸은 몸이 앞이라 그대로 둔다. 늘어난 칸은 옮긴 칸이 아니라 지어낸 칸이다 — 장부가 센다.
    그다음 몸 뒤 조각 전부, 몸 앞 조각 전부 순으로(제자리인 조각도) 옮겨진 자리에 그린다 — 몸 앞 조각이 언제나 몸 뒤 조각 위다.
    조각의 빈 칸은 그리지 않는다. 고정 칸은 언제나 맨 위다."""
    h, w = src.shape[:2]
    opaque = src[..., 3] > 0
    count = len(pins.shifts) - 1
    steps = [piece_step(pins, k, curve) for k in range(1, count + 1)]
    cells = [np.nonzero((pins.props == k) & opaque) for k in range(1, count + 1)]
    for k, ((ys, xs), step) in enumerate(zip(cells, steps), 1):
        off = {"top": 0, "left": int(np.count_nonzero(xs + step < 0)), "right": int(np.count_nonzero(xs + step >= w))}
        if off["left"] or off["right"]:
            flag, i, n = _piece_name(pins, k)
            raise SystemExit(
                f"breathe(round): {flag} 조각 {i}/{n}({ys.size}칸)이 불투명 칸 {off['left'] + off['right']}개를 셀 밖으로 "
                f"민다 — {_sides_off(off)} (셀 {w}x{h}, 조각 {step:+d}칸). 셀 여백을 늘리거나 chest_round·arms_x 를 낮춰라.")
    for behind in (True, False):
        landed = np.zeros((h, w), np.int64)          # 이 층의 조각이 놓인 칸 — 조각 번호 (0 = 아직 없음)
        for k in range(1, count + 1):
            if bool(pins.behind[k]) != behind:
                continue
            ys, xs = cells[k - 1]
            to = xs + steps[k - 1]
            clash = landed[ys, to]
            if clash.any():
                flag, i, n = _piece_name(pins, k)
                j = _piece_name(pins, int(clash[clash > 0].min()))[1]
                raise SystemExit(
                    f"breathe(round): {flag} 의 두 조각({j}/{n}, {i}/{n})이 옮겨진 뒤 {int(np.count_nonzero(clash))}칸에 함께 "
                    f"놓인다 — 어느 쪽이 앞인지 마스크가 말하지 않는다. 한 무리로 묶거나(같은 색, --props-groups colour) 한쪽을 "
                    f"다른 마스크로 옮겨라.")
            landed[ys, to] = k
    columns = np.broadcast_to(np.arange(w), (h, w))
    out[came_behind] = 0
    shows[came_behind] = -1
    for k, step in enumerate(steps, 1):
        if not step:
            continue
        piece = (pins.props == k) & opaque
        ys, xs = cells[k - 1]
        covered = np.zeros_like(piece)
        covered[ys, xs + step] = True
        ly, lx = np.nonzero(piece & ~covered)
        if step > 0:                                  # 그 줄에서 조각 바로 뒤의 첫 칸, 그리고 조각이 거기 닿은 칸
            back = np.maximum.accumulate(np.where(piece, -1, columns), axis=1)[ly, lx]
            edge = back + 1
        else:
            back = np.minimum.accumulate(np.where(piece, w, columns)[:, ::-1], axis=1)[:, ::-1][ly, lx]
            edge = back - 1
        there = (back >= 0) & (back < w)
        near = np.clip(back, 0, w - 1)
        if pins.behind[k]:
            free = ~came_body[ly, lx]
            solid = free & there & opaque[ly, near]
            out[ly[solid], lx[solid]] = src[ly[solid], edge[solid]]
            shows[ly[solid], lx[solid]] = ly[solid] * w + edge[solid]
            clear = free & there & ~opaque[ly, near]
            out[ly[clear], lx[clear]] = src[ly[clear], near[clear]]
            shows[ly[clear], lx[clear]] = ly[clear] * w + near[clear]
            out[ly[free & ~there], lx[free & ~there]] = 0
            shows[ly[free & ~there], lx[free & ~there]] = -1
        else:
            still = there & pins.hold[ly, near]
            out[ly[still], lx[still]] = src[ly[still], near[still]]
            shows[ly[still], lx[still]] = ly[still] * w + near[still]
    order = [k for k in range(1, count + 1) if pins.behind[k]] + [k for k in range(1, count + 1) if not pins.behind[k]]
    for k in order:
        ys, xs = cells[k - 1]
        to = xs + steps[k - 1]
        keep = ~(pins.hold[ys, to] | (came_body[ys, to] if pins.behind[k] else False))
        out[ys[keep], to[keep]] = src[ys[keep], xs[keep]]
        shows[ys[keep], to[keep]] = ys[keep] * w + xs[keep]
    return steps


def _behind_apart(src: np.ndarray, shows: np.ndarray, pins: Pins, carried: np.ndarray, steps: list[int]) -> None:
    """몸 뒤 조각과 그 앞의 몸이 떨어져 그 사이가 비면 거부한다. 장이 몸 뒤 조각의 불투명 칸을 데려온 출력 칸은 비우고 조각은 제
    칸만큼 다시 그리는데, 그 칸이 정지 그림에서 불투명한 조각 밖의 칸이었고 끝내 아무것도 안 그려졌으면, 몸은 장을 따라 떠났고
    조각은 다른 칸만큼 가서 몸도 조각도 없는 구멍이다 — 몸 뒤 조각이 몸 안쪽까지 걸쳐 있을 때 생긴다. `carried` 는 출력 칸마다 장이
    데려온 불투명 조각 칸의 조각 번호(0 = 아님)."""
    holes = (shows < 0) & (src[..., 3] > 0) & (pins.props == 0) & pins.behind[carried] & (carried > 0)
    if not holes.any():
        return
    k = int(carried[holes].min())
    flag, i, n = _piece_name(pins, k)
    raise SystemExit(
        f"breathe(round): {flag} 조각 {i}/{n}({int(np.count_nonzero((pins.props == k) & (src[..., 3] > 0)))}칸)과 그 앞의 몸이 "
        f"따로 움직여, 정지 그림에서 불투명하던 칸 {int(np.count_nonzero(holes & (carried == k)))}개가 빈다 (조각 "
        f"{steps[k - 1]:+d}칸) — 몸 뒤 조각이 몸 안쪽까지 걸쳐 있다. 몸 밖으로 보이는 부분만 --props-behind-mask 로 주거나 그 "
        f"부분을 --props-mask 로 주라.")


def _piece_ledger(src: np.ndarray, shows: np.ndarray, pins: Pins, steps: list[int],
                  t: float) -> tuple[list[int], list[int]]:
    """조각 번호 순으로 조각마다 (가려진 칸, 지어낸 칸) — 출처 지도(`shows`, 출력 칸마다 보이는 원본 칸 번호)에서 읽는다.
    조각의 불투명 칸은 제 목적지(제 칸 + 옮긴 칸)에 그대로 보이거나(그린 칸) 거기 앞의 것이 보인다(가려진 칸 — 고정 칸은 모든
    조각 앞이고, 몸과 몸 앞 조각은 몸 뒤 조각 앞이다). 둘의 합이 그 조각의 불투명 칸 수와 다르면 칸이 어디론가 샌 것이라 엔진
    결함이다 — 조용히 넘기지 않고 거부한다. 지어낸 칸: 제 칸의 사본이 제 목적지가 아닌 자리에 보이는 칸(몸 뒤 조각이 빠져나오며
    늘어난 테두리, 둘레의 몸이 다 못 따라간 행에 장이 남긴 사본)과, 조각이 떠난 칸에 다른 자리의 고정 칸이 보이는 칸(떠난
    자리로 늘어난 고정 칸). 고정 칸 자체는 세지 않는다."""
    h, w = shows.shape
    opaque = src[..., 3] > 0
    valid = shows >= 0
    seen = np.maximum(shows, 0)
    sy, sx = seen // w, seen % w
    yy, xx = np.mgrid[0:h, 0:w]
    label = np.where(valid & opaque[sy, sx], pins.props[sy, sx], 0)   # 보이는 불투명 조각 칸의 조각 번호 (0 = 아님)
    held = valid & pins.hold[sy, sx]
    body = valid & opaque[sy, sx] & ~pins.hold[sy, sx] & (pins.props[sy, sx] == 0)
    front = (label > 0) & ~pins.behind[label]
    hidden, filled = [], []
    for k, step in enumerate(steps, 1):
        piece = (pins.props == k) & opaque
        ys, xs = np.nonzero(piece)
        to = xs + step
        drawn = shows[ys, to] == ys * w + xs
        ahead = held[ys, to] | ((body[ys, to] | front[ys, to]) if pins.behind[k] else False)
        under = ~drawn & ahead
        if int(np.count_nonzero(drawn)) + int(np.count_nonzero(under)) != ys.size:
            flag, i, n = _piece_name(pins, k)
            raise SystemExit(
                f"breathe(round): 조각 장부가 안 맞는다 — {flag} 조각 {i}/{n}({ys.size}칸) 가운데 제자리 "
                f"{int(np.count_nonzero(drawn))}, 가려짐 {int(np.count_nonzero(under))} (위상 {t:.4f}). 엔진 결함이다 — 조용히 "
                f"넘기지 않는다.")
        covered = np.zeros_like(piece)
        covered[ys, to] = True
        copies = (label == k) & ~((sy == yy) & (sx + step == xx))
        repeated = piece & ~covered & held
        hidden.append(int(np.count_nonzero(under)))
        filled.append(int(np.count_nonzero(copies)) + int(np.count_nonzero(repeated)))
    return hidden, filled


def _round_warp(frame: Image.Image, anat: Anatomy, cfg: dict, t: float,
                pins: Pins | None = None) -> tuple[Image.Image, list[int], list[int]]:
    """둥근 가슴의 한 위상 — (칸, 조각 번호 순의 가려진 칸 수, 지어낸 칸 수). 캔버스 크기 불변, 강체 경계 위·발·고정 칸 그대로,
    정수 칸.

    몸: smooth 처럼 정사상의 역을 고정점 반복(q = o - D(q))으로 풀되 그 자리를 쌍선형으로 뜨지 않고 그 자리에 놓인 원본 칸
    하나를 통째로 옮긴다 — 출력의 칸은 모두 원본에 있던 칸이다. 장의 기울기가 행당 상한 아래라 이웃한 두 칸이 읽는 원본 칸은
    같은 줄에서 0·1·2 칸만 떨어진다 (뒤집히지 않는다). 움직이지 않는 칸은 원본 바이트 그대로 둔다. 장이 몸 칸을 셀 밖으로 밀면
    넘어간 변마다 칸 수를 밝혀 거부한다 — 고정 칸은 장이 0 이라 안 가고, 쥔 물건 조각은 `_place_pieces` 가 제 목적지로 본다.
    쥔 물건 조각은 장 위에 통째로 놓이고(`_place_pieces` — 장도 몸 앞 조각 둘레를 같은 칸만큼 옮겨 이미 거기 그렸다), 고정 칸이
    맨 위에 그 칸의 바이트로 놓인다. 조각이 떠난 칸은 빈 칸을 지어내지 않는다: 둘레의 몸이 같은 칸만큼 와서 덮거나, 바로 뒤의
    고정 칸이 늘어나거나, 몸 뒤 조각이면 그 나머지가 나온다. 쥔 물건이 있으면 출력 칸마다 보이는 원본 칸(출처 지도)을 들고,
    조각마다 가려진 칸과 지어낸 칸을 거기서 읽는다(`_piece_ledger`) — 그린 칸과 가려진 칸의 합이 조각의 칸 수와 맞는지 칸마다
    확인한다. 쥔 물건이 없으면 그 길을 타지 않는다."""
    rgba = frame.convert("RGBA")
    curve = smooth_wave(t, _shape(cfg)["inhale"])
    box = solid_alpha_bbox(rgba)
    still = [0] * (0 if pins is None else len(pins.shifts) - 1)
    if not box or curve == 0.0:
        return rgba, still, still                    # 위상 0 — 원본 그대로 (바이트)
    if anat.origin is not None:
        box = (anat.origin[0], anat.origin[1], anat.origin[0] + anat.width, anat.origin[1] + anat.height)
    src = np.asarray(rgba)
    canvas_h, canvas_w = src.shape[:2]
    y_lo = max(0, int(math.floor(box[1] + anat.rigid_row)))
    y_hi = min(canvas_h, box[1] + anat.height)
    held = pins is not None and pins.props.any()
    if held:                                         # 조각은 목 위에 있어도 옮겨진다
        rows = np.flatnonzero(pins.props.any(axis=1))
        y_lo, y_hi = min(y_lo, int(rows[0])), max(y_hi, int(rows[-1]) + 1)
    if y_hi <= y_lo:
        return rgba, still, still
    iy, ix = np.mgrid[y_lo:y_hi, 0:canvas_w]
    oy = iy.astype(np.float64) + 0.5 - box[1]        # 콘텐츠 bbox 기준 픽셀 중심
    ox = ix.astype(np.float64) + 0.5 - box[0]

    def field(x, y):
        dx, dy = _pinned(pins, box, x, y, *round_displacement(anat, cfg, x, y))
        return curve * dx, curve * dy

    fx, fy = field(ox, oy)
    land_x, land_y = ox + fx + box[0], oy + fy + box[1]
    moving = src[y_lo:y_hi, :, 3] > 0                # 장이 옮기는 몸 칸 — 고정 칸은 장이 0 이라 안 가고, 쥔 물건 조각은
    if pins is not None:                             # `_place_pieces` 가 제 목적지로 본다. 세로 몫은 위로만이라 아래 변은 안 넘는다
        moving &= ~pins.hold[y_lo:y_hi] & (pins.props[y_lo:y_hi] == 0)
    off = {"top": int(np.count_nonzero(moving & (land_y < 0.0))), "left": int(np.count_nonzero(moving & (land_x < 0.0))),
           "right": int(np.count_nonzero(moving & (land_x >= canvas_w)))}
    clipped = int(np.count_nonzero(moving & ((land_y < 0.0) | (land_x < 0.0) | (land_x >= canvas_w))))
    if clipped:
        raise SystemExit(
            f"breathe(round): 가슴·팔이 불투명 픽셀 {clipped}개를 셀 밖으로 민다 — {_sides_off(off)} (셀 {canvas_w}x"
            f"{canvas_h}, 콘텐츠 {box[0]},{box[1]}-{box[2]},{box[3]}). 셀 여백을 늘리거나 chest_round·arms_x 를 낮춰라.")
    qx, qy = ox - fx, oy - fy                        # 첫걸음: q = o - D(o)
    going = (qx != ox) | (qy != oy)
    gx, gy = ox[going], oy[going]
    wx, wy = qx[going], qy[going]
    for _ in range(7):
        dx, dy = field(wx, wy)
        wx, wy = gx - dx, gy - dy
    qx[going], qy[going] = wx, wy
    sx = np.floor(qx + box[0]).astype(np.int64)     # 그 자리에 놓인 원본 칸 (캔버스 인덱스)
    sy = np.floor(qy + box[1]).astype(np.int64)
    moved = (sx != ix) | (sy != iy)
    if pins is None and not moved.any():
        return rgba, still, still
    inside = (sx >= 0) & (sx < canvas_w) & (sy >= 0) & (sy < canvas_h)
    from_y, from_x = np.clip(sy, 0, canvas_h - 1), np.clip(sx, 0, canvas_w - 1)
    taken = src[from_y, from_x]
    taken[~inside] = 0                               # 캔버스 밖에서 온 자리는 비어 있다
    out = src.copy()
    region = out[y_lo:y_hi]
    region[moved] = taken[moved]
    hidden = filled = still
    if held:
        opaque = src[..., 3] > 0
        body = opaque & ~pins.hold & (pins.props == 0)
        back = pins.behind[pins.props]               # 몸 뒤 조각의 칸
        came_body, came_behind = body.copy(), back.copy()   # 장이 몸을, 몸 뒤 조각의 칸을 데려온 출력 칸
        came_body[y_lo:y_hi] = body[from_y, from_x] & inside
        came_behind[y_lo:y_hi] = back[from_y, from_x] & inside
        index = np.arange(canvas_h * canvas_w, dtype=np.int64).reshape(canvas_h, canvas_w)
        shows = index.copy()                         # 출처 지도 — 출력 칸마다 그 칸이 보이는 원본 칸 번호 (-1 = 빈 칸)
        shows[y_lo:y_hi][moved] = np.where(inside, sy * canvas_w + sx, -1)[moved]
        carried = np.where(opaque, pins.props, 0)    # 장이 데려온 불투명 조각 칸의 조각 번호 (0 = 아님)
        carried[y_lo:y_hi] = np.where(inside & opaque[from_y, from_x], pins.props[from_y, from_x], 0)
        steps = _place_pieces(out, shows, src, pins, curve, came_body, came_behind)
        _behind_apart(src, shows, pins, carried, steps)
    if pins is not None:
        out[pins.hold] = src[pins.hold]              # 고정 칸이 맨 위 — 장이 그 칸에서 0 이라 이미 그대로다
    if held:
        shows[pins.hold] = index[pins.hold]
        hidden, filled = _piece_ledger(src, shows, pins, steps, t)
    return Image.fromarray(out, "RGBA"), hidden, filled


# ── 해부 결과 얼리기 / 자가 복구 ────────────────────────────────────

def _fnv1a(data: bytes) -> int:
    """FNV-1a 32비트 — **JS 미러가 똑같이 계산할 수 있어야 해서** 이 해시를 쓴다.

    SHA-256 은 브라우저에서 동기로 못 구한다(SubtleCrypto 는 async 라 렌더 루프에서 못 쓴다).
    미러가 지문을 못 구하면 프리뷰는 자기가 그리는 프레임이 얼린 해부와 맞는지 확인할
    방법이 없고, 그러면 굽기만 자가 복구하고 프리뷰는 낡은 숫자로 계속 그린다
    (validator 실측 2026-07-25: 픽셀 편집 후 최대 617바이트, 불투명 픽셀 수까지 불일치).
    충돌 위험은 "프레임이 바뀌었나" 판정에는 무시할 수준이다."""
    h = 2166136261
    for b in data:
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h


def _num(value) -> str:
    """키에 들어갈 수의 정규형 — 파이썬과 JS 가 **같은 문자열**을 내야 한다.

    `f"{v:.6f}"` 와 `v.toFixed(6)` 는 6번째 자리가 정확히 반올림 경계일 때 갈린다(파이썬은
    십진 표현 기준 round-half-even, JS 는 이진값 기준). `repr` 계열도 지수 표기가 다르다
    (`1e-07` vs `1e-7`). 그래서 **부동소수 곱·합·floor 만** 쓴다 — 양쪽 다 IEEE754 double 이라
    같은 입력에 같은 결과가 나오는 연산이다."""
    if value is None:
        return "~"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(math.floor(float(value) * 1000000.0 + 0.5))
    return str(value)


def _canon(value) -> str:
    """키에 들어갈 값의 정규 직렬화 — dict 는 키 정렬, 수는 `_num`."""
    if isinstance(value, dict):
        return "{" + ",".join(f"{k}={_canon(value[k])}" for k in sorted(value, key=str)) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_canon(v) for v in value) + "]"
    return _num(value)


def reference_key(*, state: str, variant: str, request_stamp: str, source_index: int,
                  source_stamp: str, pixel_ops, transform) -> str:
    """기준 프레임의 **정체성** — 그 프레임을 만드는 입력들로만 만든다. 픽셀은 안 읽는다.

    예전엔 이게 *변형 결과 RGBA* 의 해시였다. 그런데 굽기는 `apply_transform` 에서
    부드럽게 리샘플하고(당시 BICUBIC, 지금 `transform_cell`; `snap_scale` 없는 런 = 기본 런 전부) 웹뷰 캔버스는
    `imageSmoothingEnabled=false`, 즉 **NEAREST** 다. 같은 원본에 같은 변형을 걸어도 두 쪽이
    만드는 그림이 다르니 지문은 **영구 불일치**였다 — 회전·확대가 걸린 줄은 프리뷰가 영원히
    원본으로 떨어지고 영상 내보내기가 영구 차단됐으며, 안내대로 "해부를 갱신" 해도 라우트가
    또 BICUBIC 프레임으로 같은 숫자를 만들어 **절대 안 풀렸다** (validator 실측 2026-07-26:
    rotate 3°에서 555px 상이, 정수 이동만 걸린 줄은 우연히 일치).

    입력을 해시하면 리샘플러가 식에서 아예 빠진다. 여기 들어가는 값은 전부 사이드카(사람의
    의도)와 서버가 준 파일 스탬프라, 웹뷰가 **동기로 정확히** 아는 것들이다. 덤으로 웹뷰가
    신선도 판정에 캔버스를 읽을 이유가 없어져서 "어느 캔버스를 쟀나" 계열 결함(9·10라운드)이
    구조적으로 사라진다.

    실패 방향도 안전하다: 런을 복사해 mtime 이 바뀌면 키가 달라져 **시끄럽게 거부**하고 한 번
    다시 잰다 — 조용히 낡은 숫자로 굽는 반대 방향이 아니다.

    ## 왜 이 재료들인가 (그리고 셀·snap 이 왜 없는가)

    재료는 전부 웹뷰가 **동기로 정확히** 아는 것이어야 한다. 사이드카 값(변종·픽셀편집·변형)은
    웹뷰가 소유한 canon 이고, 파일 스탬프 둘은 서버가 상태 응답에 실어 보낸다.

    셀 크기와 `snap_scale` 은 뺐다 — 둘 다 `sprite-request.json` 과 변종의 순수 함수인데,
    변종은 이미 키에 있고 request 는 `request_stamp` 로 통째로 덮인다. 파생값을 또 넣으면
    양쪽이 그 파생을 각자 재구현해야 하고(웹뷰의 측정 k 는 `pixel_snap_scale` 과 다른
    검출기다) 거기서 드리프트가 난다. 원인을 덮는 편이 결과를 흉내내는 것보다 안전하다."""
    # 정규화를 **키 안에서** 한다. 호출부에 맡기면 한쪽은 사이드카 원문(`{"rotate": 3}`)을,
    # 다른 쪽은 항등 머지본(7키 전부)을 넘겨 같은 프레임이 다른 키를 갖는다 — 변형이 없는
    # 프레임(대부분)이 정확히 그 모양이었다.
    return "|".join((
        "breathe-ref-v1", str(state), str(variant), str(request_stamp),
        str(int(source_index)), str(source_stamp),
        _canon(pixel_ops or {}), _canon(normalize_transform(transform)),
    ))


def anatomy_fingerprint(key: str) -> str:
    """기준 프레임 키의 지문 — 변종·소스 인덱스는 읽을 수 있게 남기고 나머지는 해시한다.

    키를 그대로 쓰면 거부 메시지는 친절해지지만 사이드카가 픽셀 편집량만큼 부푼다(칠한
    점 하나가 키 한 조각이다). 앞머리 두 조각만 남겨 "어느 변종의 몇 번 프레임" 은
    보이게 하고, 입력 전체는 해시로 접는다."""
    parts = key.split("|")
    variant, index = (parts[2], parts[4]) if len(parts) > 5 else ("?", "?")
    return f"{variant}:{index}:{_fnv1a(key.encode('utf-8')):08x}"


def resolve_anatomy(reference: Image.Image, cfg: dict) -> Anatomy:
    """**줄 전체가 공유하는 한 벌**을 기준 프레임에서 확정한다.

    해부는 **캐릭터의 속성이지 프레임의 속성이 아니다.** 깜빡임 프레임이라고 목이 옮겨
    가지 않는다. 프레임마다 다시 재면 검출 지터로 `rigid_row` 가 흔들리고(실측 2↔3),
    그러면 "강체 구간" 이 프레임 간 **같은 구간이 아니게 된다** — 이 모듈의 핵심 계약이
    프레임별 재검출 때문에 깨지는 것이다. 게다가 사이드카에는 해부가 한 벌뿐이라
    프리뷰(미러)는 그 한 벌로 그리고 굽기는 프레임마다 다른 값으로 구워 갈렸다
    (validator 실측 2026-07-25: 골든 픽스처 idle 4프레임에서 최대 220바이트, 불투명 픽셀
    **수**까지 불일치 — 위치가 아니라 그림이 달랐다).

    그래서 지문은 **기준 프레임 하나**를 지킨다: 스프라이트가 바뀌면 여기서 잡혀 한 번
    다시 재고 그 사실을 보고한다. 나머지 프레임이 서로 다른 것은 정상이며 재검출 사유가
    아니다.

    `rigid_row` 는 **사람의 의도(입력)** 이고 `anatomy` 는 거기서 파생된 **캐시**다.
    그래서 얼린 값이 override 와 어긋나면 캐시가 낡은 것이므로 다시 잰다 — 얼린 값을
    그대로 쓰면 사람이 고친 숫자가 조용히 버려진다 (validator 검증 2026-07-25: cfg 33 을
    줘도 얼린 23 이 구워졌고 경고도 없었다).

    **굽기는 얼린 해부를 쓰지 않는다 — 매번 자기 기준 프레임에서 다시 잰다.** 굽기는
    진짜 프레임을 손에 들고 있으니 재는 게 언제나 옳고, 얼린 값은 웹뷰가 미리보기를
    그리려고 들고 있는 **캐시**일 뿐이다 (C11: `rigid_row` 는 의도, `anatomy` 는 캐시).
    예전엔 여기서 얼린 값을 신뢰할지 판정하려고 프레임 RGBA 를 해시했는데, 그 해시가
    웹뷰와 영구 불일치를 만드는 원흉이었다 — `reference_key` 주석 참조.

    사이드카 캐시가 실제로 구운 값과 어긋났는지는 `anatomy_report` 가 대조해서 보고한다.
    "재검출했나(proxy)" 보다 "**사이드카와 다른 값을 구웠나**" 가 원칙 6이 요구하는 바로
    그 관측이다."""
    return analyze(reference, rigid_row=cfg.get("rigid_row"),
                   axis_x=cfg.get("axis_x"), torso_half=cfg.get("torso_half"))


def anatomy_report(images: list[Image.Image], cfg: dict, anat: Anatomy | None = None) -> dict:
    """굽기가 실제로 쓴 해부를 manifest 에 실을 형태로 — 자가 복구를 관측 가능하게.

    줄 전체가 **한 벌**을 쓰므로 보고도 한 벌이다. 예전엔 프레임별로 재서
    `rigid_row_varies` 를 실어 보냈는데, 그건 관측이 아니라 결함의 증상이었다 —
    경계가 프레임마다 움직이면 강체 구간이 프레임 간 같은 구간이 아니다. 굽기에 넘길
    해부를 이미 쟀으면 `anat` 로 받는다 (같은 칸을 두 번 재지 않는다)."""
    if not images:
        return {"anatomy": None, "matches_sidecar": True, "warnings": []}
    if anat is None:
        anat = resolve_anatomy(images[0], cfg)
    baked = anat.as_dict()
    frozen = cfg.get("anatomy")
    # 사이드카가 들고 있던 캐시와 실제로 구운 값의 **대조**. 캐시가 없으면 대조할 게 없다.
    # 지문 비교가 아니라 값 비교인 게 핵심이다 — 지문은 웹뷰가 자기 미리보기의 신선도를
    # 판정하는 도구이고, 여기서 궁금한 건 "사이드카 숫자와 다른 그림을 구웠나" 다.
    stale = None
    if isinstance(frozen, dict):
        stale = {k: [frozen.get(k), v] for k, v in baked.items()
                 if k in frozen and frozen.get(k) != v}
    return {
        "anatomy": baked,
        "matches_sidecar": not stale,
        "sidecar_drift": stale or None,
        "warnings": sorted(anat.warnings),
    }


def freeze_anatomy(frame: Image.Image, cfg: dict, key: str) -> dict:
    """큐레이션 시점에 해부를 1회 돌려 사이드카에 얼릴 dict 를 만든다.

    이걸 사이드카에 넣어두면 굽기와 큐레이터 웹뷰가 같은 숫자를 읽는다 — 웹뷰는
    검출을 재구현하지 않고 warp 만 미러링하면 된다 (검출 중복 제거)."""
    anat = analyze(frame, rigid_row=cfg.get("rigid_row"),
                   axis_x=cfg.get("axis_x"), torso_half=cfg.get("torso_half"))
    return {**anat.as_dict(), "fingerprint": anatomy_fingerprint(key)}


# ── 재생 시퀀스 계약 (compose/GIF 진입점) ───────────────────────────

def fit_breathe_pattern(seq_len: int, cfg: dict) -> list[float]:
    """시퀀스 길이에 딱 맞는 호흡 위상 시퀀스 (길이 == seq_len, 루프 불변).

    위상은 [0, 1) 의 연속 값이다 — 구 방식의 정수 분할선 단계가 아니다. breaths 회가
    시퀀스 안에서 정확히 반복되므로 루프 이음매가 없고, 등분 보정도 필요 없다.

    **정수 나머지를 먼저 취한다.** `(i*breaths/seq_len) % 1.0` 로 쓰면 수학적으로 같은
    위상이 서로 다른 double 이 되어(18슬롯 3호흡: 유니크 6 -> 14) 아틀라스 칸 재사용이
    표현 노이즈로 깨진다. 분자를 정수로 접고 한 번만 나누면 반복 위상이 비트 동일하다
    (validator 검증 2026-07-25: 시트 1344x192 -> 576x192).

    줄이 루프의 한 토막이면 (smooth `start_cell`·`loop_cells` — 루프 세트의 들어감·나옴 조각) 칸 i 의 위상은 그 루프
    (`breathe_loop`)의 칸 (start_cell + i) mod loop_cells 의 위상, 같은 double 이다. 그래서 토막은 루프의 숨을 그 칸에서
    위상 그대로 잇는다. 둘 다 생략이면 줄이 곧 루프다."""
    if seq_len <= 0:
        return []
    loop = breathe_loop(seq_len, cfg)
    start = int(cfg.get("start_cell") or 0)
    if start >= len(loop):
        raise SystemExit(f"breathe: start_cell {start} 가 {len(loop)}칸 루프 밖이다 — 줄이 루프의 몇째 칸에서 시작하나다 "
                         f"(0 부터 {len(loop) - 1} 까지). 루프가 이 칸들보다 길면 loop_cells 로 그 칸 수를 주라.")
    if start == 0 and len(loop) == seq_len:
        return loop
    return [loop[(start + i) % len(loop)] for i in range(seq_len)]


def breathe_loop(seq_len: int, cfg: dict) -> list[float]:
    """줄의 숨이 놓인 루프 한 바퀴의 위상 — `loop_cells` 칸(생략이면 줄의 `seq_len` 칸)에 숨 박자(`breaths` 회, 또는
    `breath_peaks` 칸의 꼭대기)를 놓은 것. 줄이 곧 루프면 줄의 위상(`fit_breathe_pattern`)과 같고, 루프의 한 토막이면
    토막의 위상이 이 안에서 읽힌다. Sway 의 접힘 규칙이 토막을 루프의 숨 전체로 재는 것도 이것이다."""
    n = int(cfg.get("loop_cells") or seq_len)
    if cfg.get("breath_peaks"):
        return _peaked_phases(n, list(cfg["breath_peaks"]), smooth_inhale(cfg))
    breaths = max(1, int(cfg.get("breaths", 1)))
    return [((i * breaths) % n) / n for i in range(n)]


def _peaked_phases(seq_len: int, peaks: list[int], inhale: float) -> list[float]:
    """들숨 꼭대기 칸을 바깥에서 받은 위상 (smooth) — 숨 k 는 쉼에서 시작해 `peaks[k]` 칸에서 가득 차고(위상
    `inhale`) 다음 쉼으로 돌아간다. 쉼은 0 칸, 꼭대기 사이를 날숨 1-inhale : 들숨 inhale 로 나누는 자리, 그리고
    루프 끝이다 — 첫 칸이 쉼이고 루프가 쉼에서 닫힌다. 숨마다 위상은 [0, 1) 이다."""
    if peaks[-1] > seq_len - 2:
        raise SystemExit(f"breathe: breath_peaks 의 마지막 {peaks[-1]} 가 {seq_len}칸 루프의 끝에 너무 가깝다 — "
                         f"꼭대기 뒤에 날숨이 들어갈 칸이 있어야 루프가 쉼에서 닫힌다 ({seq_len - 2} 까지).")
    rests = [0.0] + [p + (1.0 - inhale) * (q - p) for p, q in zip(peaks, peaks[1:])] + [float(seq_len)]
    phases = []
    k = 0
    for i in range(seq_len):
        while i >= rests[k + 1]:
            k += 1
        start, peak, end = rests[k], peaks[k], rests[k + 1]
        if i <= peak:
            phases.append(inhale * (i - start) / (peak - start))
        else:
            phases.append(inhale + (1.0 - inhale) * (i - peak) / (end - peak))
    return phases


def fitted_breath_count(seq_len: int, cfg: dict) -> int:
    """실제 적용되는 호흡 횟수 — 연속 위상이라 요청값이 그대로 성립한다."""
    if seq_len <= 0:
        return 0
    return max(1, int(cfg.get("breaths", 1)))


def recommended_breathe_frames(cfg: dict, per_cycle: int = SMOOTH_CYCLE_FRAMES) -> int:
    """호흡이 부드럽게 읽히려면 필요한 최소 재생-시퀀스 길이.

    정지 1컷 + 링크 복제로 프레임을 찍어내는 레시피(정지자세)는 이 값으로 복제 수를
    정한다: `clones = recommended_breathe_frames(cfg) - 1`. 유저가 이미 가진 프레임
    수를 줄이거나 호흡 횟수를 바꾸지 않는다 — 오직 프레임을 새로 만들 때의 목표다."""
    return max(1, int(cfg.get("breaths", 1))) * max(2, per_cycle)


def breathe_reads_smoothly(seq_len: int, cfg: dict, per_cycle: int = SMOOTH_CYCLE_FRAMES) -> bool:
    """요청한 호흡 횟수가 이 시퀀스 길이에서 부드럽게 렌더되는가 (관측용)."""
    if seq_len <= 0:
        return False
    return seq_len // max(1, int(cfg.get("breaths", 1))) >= max(2, per_cycle)


def phase_frame(frame: Image.Image, cfg: dict, phase: float, anat: Anatomy | None = None,
                hold: np.ndarray | None = None, props: np.ndarray | None = None,
                behind: np.ndarray | None = None) -> Image.Image:
    """프레임에 호흡 위상 하나(0 <= phase < 1)를 적용.

    `anat` 를 주면 그것을 쓴다 — 줄 전체가 한 벌을 공유해야 하므로 호출자가 한 번
    확정해 넘기는 게 정석이다. 생략하면 이 프레임을 기준으로 확정한다 (단발 호출용).
    `cfg["mode"]` 가 smooth 면 smooth 로 굽는다 — GIF·아틀라스·레이어·CLI 가 모두 여기를 탄다.
    `hold`·`props`·`behind` 는 고정 칸·쥔 물건·몸 뒤 물건 마스크(캔버스 크기) — `bake_breathe_sequence`."""
    if anat is None:
        anat = resolve_anatomy(frame, cfg)
    pins = row_pins(anat, cfg, frame, hold, props, behind)
    _row_refusals(cfg, anat, pins)
    return _bake_phase(frame, cfg, phase, anat, pins)


def _pixel_depths(cfg: dict) -> tuple[float, float | None]:
    raw_dx = cfg.get("depth_x")
    return float(cfg.get("depth", DEFAULT_DEPTH)), None if raw_dx is None else float(raw_dx)


def _row_refusals(cfg: dict, anat: Anatomy, pins: Pins | None = None) -> None:
    """줄이 굽기 전에 거부되는 까닭 — 해부와 설정(과 고정 칸·쥔 물건)에만 달려 줄에 한 번 본다 (칸마다 다시 재지 않는다)."""
    if breathe_mode(cfg) == BREATHE_SMOOTH:
        _smooth_refusals(cfg, anat, pins)
        return
    if pixel_round(cfg):
        _round_refusals(cfg, anat, pins)
        return
    if _bounds(cfg) is None:
        depth, depth_x = _pixel_depths(cfg)
        strains = [(axis, row_strain(anat, d)) for axis, d in (("depth", depth), ("depth_x", depth_x)) if d is not None]
    else:
        # 최소·최대 줄은 극값 그대로 잰다 — 이득 (B ± A·WAVE_PEAK) 의 큰 쪽이 봉투 최대 행에서 걸린다.
        peak = envelope_peak(anat)
        strains = [(f"{axis}_min·{axis}_max", (abs(b) + abs(a) * WAVE_PEAK) * peak)
                   for axis, (b, a) in zip(("height", "width"), pixel_gains(anat, cfg))]
    for axis, strain in strains:
        if strain > MAX_ROW_STRAIN:
            raise SystemExit(
                f"breathe: 행당 변형({axis}) {strain:.3f} > 상한 {MAX_ROW_STRAIN} — 변형 구간이 너무 "
                f"좁다 (강체 경계 {anat.rigid_row}/{anat.height}, 정규화 기준 {anat.basis_row}). "
                f"{axis} 를 줄이거나 rigid_row 를 올려라. 조용히 깎지 않는다.")


def _bake_phase(frame: Image.Image, cfg: dict, phase: float, anat: Anatomy, pins: Pins | None = None) -> Image.Image:
    """거부 검사(`_row_refusals`)를 마친 줄의 한 칸 (`pins` 는 줄의 고정 칸·쥔 물건)."""
    return _bake_phase_pieces(frame, cfg, phase, anat, pins)[0]


def _bake_phase_pieces(frame: Image.Image, cfg: dict, phase: float, anat: Anatomy,
                       pins: Pins | None = None) -> tuple[Image.Image, list[int], list[int]]:
    """`_bake_phase` 와 그 칸에서 조각 번호 순의 가려진 칸 수·지어낸 칸 수 (쥔 물건은 pixel 의 둥근 가슴만 받는다 — 다른 줄은
    빈 목록). `bake_breathe_sequence` 의 `record`."""
    if breathe_mode(cfg) == BREATHE_SMOOTH:
        return _smooth_warp(frame, anat, cfg, phase, pins), [], []
    if pixel_round(cfg):
        return _round_warp(frame, anat, cfg, phase, pins)
    return _warp(frame, anat, float(cfg.get("lag", DEFAULT_LAG)), phase, pixel_gains(anat, cfg)), [], []


def bake_breathe_sequence(images: list[Image.Image], cfg: dict, anat: Anatomy | None = None,
                          hold: np.ndarray | None = None, props: np.ndarray | None = None,
                          behind: np.ndarray | None = None,
                          record: dict | None = None) -> tuple[list[Image.Image], list[float]]:
    """재생 시퀀스에 호흡 레이어를 굽는다 -> (프레임들, 적용 위상들).

    출력 길이 = 입력 길이 (루프 불변 — 루프는 기존 프레임 그대로, 호흡이 그 안에서
    breaths 회 딱 떨어진다). `anat` 는 줄의 해부 한 벌 — 생략하면 첫 칸에서 잰다.
    `hold` 는 고정 칸 마스크(캔버스 크기 bool, `read_mask`) — 그 칸은 모든 칸에서 그 칸의 바이트 그대로다. 변위장으로
    굽는 줄(smooth, pixel 의 둥근 가슴)만 받는다. `props` 는 쥔 물건 마스크, `behind` 는 몸 뒤 물건 마스크 — 조각마다 그쪽
    팔과 같이 통째로 옮겨진다 (pixel 의 둥근 가슴에 arms_x 가 있을 때만; 무리 번호 격자면 한 번호의 조각들이 같이 — `row_pins`).
    `record` 에 dict 를 주면 줄의 격자(`pins` — `row_pins`, 마스크가 없으면 None)와 칸마다 조각 번호 순의 가려진 칸 수
    (`hidden`)와 지어낸 칸 수(`filled`, 둘 다 `_piece_ledger`)를 거기 담는다: `sprite-gen breathe` 가 그 수를 breathe.json 과
    경고 줄(`piece_warnings`)에 싣는다 — 가려진 칸을 조용히 버리지 않고, 지어낸 칸을 조용히 채우지 않는다."""
    if not images:
        return images, []
    phases = fit_breathe_pattern(len(images), cfg)
    if anat is None:
        anat = resolve_anatomy(images[0], cfg)    # 줄 전체가 한 벌을 공유한다
    pins = row_pins(anat, cfg, images[0], hold, props, behind)
    _row_refusals(cfg, anat, pins)
    baked = [_bake_phase_pieces(images[i], cfg, phases[i], anat, pins) for i in range(len(images))]
    if record is not None:
        record["pins"], record["hidden"], record["filled"] = pins, [b[1] for b in baked], [b[2] for b in baked]
    return [b[0] for b in baked], phases


def piece_warnings(record: dict, flag: str) -> list[str]:
    """breathe.json 의 쥔 물건 기록 하나(`props`·`props_behind`, 조각마다 `hidden`·`filled`)에서 경고 줄 — 가려진 칸이 있는
    조각마다 한 줄(고정 칸 밑으로, 몸 뒤 조각은 몸이나 몸 앞 조각 밑으로도 들어가 그리지 않은 칸), 지어낸 칸이 있는 조각마다 한 줄
    (옮긴 칸이 아니라 곁의 칸을 늘여 채운 칸). 가려진 칸은 조용히 버리지 않고, 지어낸 칸은 조용히 채우지 않는다."""
    lines = []
    pieces = record.get("pieces", [])
    section = "props_behind" if flag == "--props-behind-mask" else "props"
    for i, piece in enumerate(pieces):
        for key in ("hidden", "filled"):
            counts = piece.get(key, [])
            frames = [j for j, n in enumerate(counts) if n]
            if not frames:
                continue
            top = max(range(len(counts)), key=lambda j: counts[j])
            span = f"in {len(frames)} of {len(counts)} frames, up to {piece[key + '_max']} cells (frame {top})"
            head = f"{flag} piece {i + 1} of {len(pieces)} ({piece['cells']} cells)"
            if key == "hidden":
                under = ("held cells, the body or a piece held in front of it" if flag == "--props-behind-mask"
                         else "held cells")
                lines.append(f"{head} goes under {under} {span}; those cells are not drawn — breathe.json "
                             f"{section}.pieces[{i}].hidden")
            else:
                lines.append(f"{head} leaves cells it fills by repeating a cell {span}; those cells are made up, not moved "
                             f"— breathe.json {section}.pieces[{i}].filled")
    return lines


# ── CLI: 프레임 폴더에 굽기 (`sprite-gen breathe`) ─────────────────

def _cells(text: str) -> list[int]:
    try:
        return [int(part) for part in text.split(",") if part.strip()]
    except ValueError:
        raise argparse.ArgumentTypeError(f"cell numbers separated by commas, not {text!r}")


def _box(text: str) -> tuple[float, float, float, float]:
    try:
        x0, y0, x1, y1 = (float(part) for part in text.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError(f"x0,y0,x1,y1 as shares of the picture (0..1), not {text!r}")
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        raise argparse.ArgumentTypeError(f"x0,y0,x1,y1 as shares of the picture, 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1, "
                                         f"not {text!r}")
    return x0, y0, x1, y1


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("frames", help="folder of the loop's frames (*.png, played in name order)")
    parser.add_argument("out", help="new folder for the breathing frames (same names) and breathe.json")
    parser.add_argument("--mode", choices=BREATHE_MODES, default=None,
                        help="pixel (default): integer rows and columns, for pixel art; smooth: the head stays "
                             "in place, the body rises smoothly, for large illustrations and video frames")
    parser.add_argument("--depth", type=float, default=None,
                        help="how far the body rises, as a share of its height below the neck "
                             f"(default {DEFAULT_DEPTH} pixel, {DEFAULT_SMOOTH_DEPTH} smooth)")
    parser.add_argument("--depth-x", type=float, default=None,
                        help=f"sideways swell (pixel: follows --depth; smooth: the chest puffs out by this share, "
                             f"default {DEFAULT_SMOOTH_DEPTH_X})")
    size = parser.add_argument_group(
        "the breath's size as its extremes, shares of the original (instead of --depth and --depth-x; a bound left out "
        "is 0, the original size; pixel: wider while lower, smooth: the chest puffs as it rises)")
    size.add_argument("--width-min", type=float, default=None,
                      help="the narrowest the body gets, a share of its width where it breathes most (pixel: the "
                           "torso's columns on the fullest row; smooth: the chest's swell at its peak); 0 never "
                           "narrower than the original")
    size.add_argument("--width-max", type=float, default=None, help="the widest, the same share (-0.2..0.2)")
    size.add_argument("--height-min", type=float, default=None,
                      help="the lowest, a share of the body's height below the neck (pixel: the head's top line; "
                           "smooth: the chest), negative down")
    size.add_argument("--height-max", type=float, default=None,
                      help="the highest, the same share; 0 never higher than the original")
    parser.add_argument("--breaths", type=int, default=None, help="breaths per loop (default 1)")
    parser.add_argument("--lag", type=float, default=None, help=f"pixel only: travelling-wave lag (default {DEFAULT_LAG})")
    parser.add_argument("--rigid-row", type=int, default=None,
                        help="the row the head starts below, counted from the top of the figure (default: measured)")
    parser.add_argument("--axis-x", type=int, default=None,
                        help="the body's axis, a column counted from the left of the figure (default: measured)")
    parser.add_argument("--torso-half", type=int, default=None,
                        help="the torso's half width in pixels: columns farther than this from the axis are appendages — "
                             "pushed, never stretched; the round chest's arms (default: measured)")
    parser.add_argument("--reference", default=None, metavar="FRAME.png",
                        help="the frame the row's anatomy is measured on, when it is not the first of these frames — a loop "
                             "set's first cell, for a way in or out of the loop that starts elsewhere: the head line, the chest and "
                             "its rise are the loop's (one size with the frames; default the first frame)")
    parser.add_argument("--hold-mask", default=None, metavar="MASK.png",
                        help="cells held still: the mask's light opaque pixels (one size with the frames) keep their bytes "
                             "in every frame; the breath fades to nothing along their rows and columns (smooth, or pixel "
                             "with --chest-round or --arms-x; default none)")
    parser.add_argument("--props-mask", default=None, metavar="MASK.png",
                        help="what the arms hold (a sword, a shield): each piece of the mask's light opaque pixels (8-connected, "
                             "cells within 2 px joined) moves whole and sideways as far as the hand holding it, the chest's push "
                             "there plus --arms-x, and the hand round it moves the same whole cells, so no gap opens between "
                             "them; cells a piece leaves beside a held cell take that held cell, and cells it moves onto held "
                             "cells stay hidden under them, both counted per frame in breathe.json (filled, hidden) and named "
                             "in warning lines; a piece pushed off the frame, or two pieces landing on one cell, is refused "
                             "(pixel with --arms-x; default none)")
    parser.add_argument("--props-behind-mask", default=None, metavar="MASK.png",
                        help="what the arms hold behind the body (a shield hung at the back): its pieces move as --props-mask "
                             "pieces do, but the body stays in front of them: it does not follow them, and where a piece pulls "
                             "out from behind it the piece's cell beside it repeats over the cells it left, counted as filled; "
                             "a piece and the body moving apart so that cells of the still go empty is refused (pixel with "
                             "--arms-x; default none)")
    parser.add_argument("--props-groups", choices=("piece", "colour"), default=None,
                        help="piece (default): each piece follows its own hand; colour: the pieces of one colour of the props "
                             "masks move by the same cells, read where they touch the body, so a piece the hand does not touch "
                             "(a sword's reflection in the water, painted the sword's colour) follows the hand")
    round_ = parser.add_argument_group("round chest (pixel; off by default)")
    round_.add_argument("--chest-round", type=float, default=None,
                        help="the chest swells round from its peak: its rim moves out by this share of the body below "
                             "the neck at the in-breath's top, whole cells, the head held (0..0.2; 0 or left out: off)")
    round_.add_argument("--arms-x", type=float, default=None,
                        help="the arms beside the torso move sideways, out from the body, by this share of the body "
                             "below the neck — pushed whole, never stretched (0..0.2; 0 or left out: off)")
    stretch = parser.add_argument_group("a stretch of a loop (smooth or round chest; default the frames are the loop)")
    stretch.add_argument("--loop-cells", type=int, default=None, metavar="N",
                         help="the frames carry on the breath of an N-cell loop — a way in or out of a loop set: the beat "
                              "(--breaths, --breath-peaks) is that loop's")
    stretch.add_argument("--start-cell", type=int, default=None, metavar="K",
                         help="the loop's cell the frames start at, 0 to N - 1 (default 0): frame i breathes as the loop's "
                              "cell (K + i) mod N, the very phase")
    shape = parser.add_argument_group("smooth shape (defaults in parentheses; the round chest reads the chest's ellipse "
                                      "and peak, --inhale and --breath-peaks too)")
    shape.add_argument("--chest-y", type=float, default=None,
                       help=f"chest centre height, a share of the body below the neck ({SMOOTH_SHAPE['chest_y']})")
    shape.add_argument("--chest-rx", type=float, default=None,
                       help=f"chest weight's half width, times the torso half width ({SMOOTH_SHAPE['chest_rx']})")
    shape.add_argument("--chest-ry", type=float, default=None,
                       help=f"chest weight's half height, a share of the body below the neck ({SMOOTH_SHAPE['chest_ry']})")
    shape.add_argument("--shoulder", type=float, default=None,
                       help=f"how far the shoulders rise, times the chest's ({SMOOTH_SHAPE['shoulder']})")
    shape.add_argument("--shoulder-lag", type=float, default=None,
                       help=f"how late the shoulders peak, a share of one breath ({SMOOTH_SHAPE['shoulder_lag']})")
    shape.add_argument("--chest-tilt", type=float, default=None,
                       help="the chest weight turned clockwise on screen, degrees, for a body turned aside (0)")
    shape.add_argument("--chest-bias", type=float, default=None,
                       help="one side of the chest breathes more, -0.9..0.9, negative the screen's left (0)")
    shape.add_argument("--chest-dir", type=float, default=None,
                       help="where the chest moves, degrees from straight up, negative up-left (0)")
    shape.add_argument("--chest-x", type=float, default=None,
                       help="the chest's centre moved off the body axis, times the torso half width (0)")
    shape.add_argument("--chest-bias-y", type=float, default=None,
                       help="the chest's peak moved across its long axis, times its half height, positive down (0)")
    shape.add_argument("--chest-flat", type=float, default=None,
                       help="share of the way from the peak to the rim that rises in full (0)")
    shape.add_argument("--inhale", type=float, default=None,
                       help="share of one breath the in-breath takes, the rest the out-breath; the in-breath peaks at this "
                            f"phase ({SMOOTH_SHAPE['inhale']})")
    shape.add_argument("--breath-peaks", type=_cells, default=None, metavar="CELL,CELL,...",
                       help="smooth: the cells where each in-breath peaks (the breath count is how many); the first "
                            "cell stays at rest and the loop closes at rest")
    beat = parser.add_argument_group("the beat chosen to miss the hands (smooth; off by default)")
    beat.add_argument("--avoid-region", type=_box, default=None, metavar="X0,Y0,X1,Y1",
                      help="the hands in front of the chest, as shares of the picture: the breath count (or each in-breath "
                           "peak) is chosen from the frames so the in-breath peaks miss the hands' own rise and the chest stays "
                           "above them; the choice and every candidate go into breathe.json `beat`. Not with --breaths or "
                           "--breath-peaks")
    beat.add_argument("--avoid-anchor", type=_box, default=None, metavar="X0,Y0,X1,Y1",
                      help="the body the hands' own move is read against, as shares of the picture (default: the band just "
                           "above the hands, in their columns)")
    beat.add_argument("--fps", type=float, default=None,
                      help="the frames' rate, for the length of a breath (a video-loop cycle/ folder has its own in the "
                           "loop's strip meta)")


def _cli_breathe(raw: dict) -> dict:
    try:
        return state_breathe({"states": {"frames": {"breathe": raw}}}, "frames")
    except SystemExit as exc:
        raise SystemExit(f"breathe: 사이드카와 같은 검사에서 거부됐다 — {exc}")


def run(*, frames: str, out: str, mode: str | None = None, depth: float | None = None,
        depth_x: float | None = None, breaths: int | None = None, lag: float | None = None,
        rigid_row: int | None = None, chest_y: float | None = None, chest_rx: float | None = None,
        chest_ry: float | None = None, shoulder: float | None = None, shoulder_lag: float | None = None,
        chest_tilt: float | None = None, chest_bias: float | None = None, chest_dir: float | None = None,
        chest_x: float | None = None, chest_bias_y: float | None = None, chest_flat: float | None = None,
        inhale: float | None = None, breath_peaks: list[int] | None = None,
        avoid_region: tuple[float, float, float, float] | None = None,
        avoid_anchor: tuple[float, float, float, float] | None = None, fps: float | None = None,
        reference: str | None = None, loop_cells: int | None = None, start_cell: int | None = None,
        chest_round: float | None = None, arms_x: float | None = None, hold_mask: str | None = None,
        props_mask: str | None = None, axis_x: int | None = None, torso_half: int | None = None,
        props_behind_mask: str | None = None, props_groups: str | None = None, width_min: float | None = None,
        width_max: float | None = None, height_min: float | None = None, height_max: float | None = None) -> int:
    """프레임 폴더에 Breathe 레이어를 굽는다 — 큐레이션 사이드카 `breathe` 와 같은 값, 같은 정규화,
    같은 굽기(`bake_breathe_sequence`). 영상 루프의 칸처럼 큐레이션 런이 아닌 프레임이 이 길로 온다.

    `avoid_region` 이면 숨 박자를 칸에서 고른다(`breath_beat`) — 고른 박자도 사이드카와 같은 검사를 다시 지난다.
    `loop_cells`·`start_cell` 이면 칸들이 그 루프의 숨을 그 칸에서 잇는 토막이고(`fit_breathe_pattern`), `reference` 면
    해부를 첫 칸 대신 그 칸에서 잰다 — 루프 세트의 첫 칸에서 재면 토막의 머리선·가슴·오르는 양이 루프의 것과 같다.
    `hold_mask` 면 그 PNG 의 흰 칸이 모든 칸에서 바이트 그대로다 — breathe.json 의 `hold` 에 그 파일의 경로·sha256·칸 수가
    실린다. `props_mask` 면 그 PNG 의 흰 칸 조각이 팔과 같이 통째로 옮겨진다 — `props` 에 같은 기록과 조각마다 칸 수·들숨
    꼭대기의 가로 px, 칸마다 고정 칸 밑으로 가려진 칸 수(`hidden`)와 떠난 자리로 늘어나 지어낸 칸 수(`filled`), 그 최대
    (`hidden_max`·`filled_max`)가 실리고, 가려진 칸이나 지어낸 칸이 있는 조각마다 경고 줄이 나온다. `props_behind_mask` 는 몸 뒤
    물건의 같은 기록(`props_behind`)이다. `props_groups` 가 colour 면 두 마스크의 한 색 조각들이 같은 칸만큼 가고, 조각마다 그 색
    (`colour`)이 실린다. `width_min`·`width_max`·`height_min`·`height_max` 는 세기(`depth`·`depth_x`) 대신 숨의 극값이고,
    breathe.json 의 `range` 는 어느 줄이든 그 극값을 최소·최대 키의 단위로 싣는다 (`breathe_range` — 세기로 구운 판을
    최소·최대로 옮길 때 그 수를 그대로 쓴다)."""
    src_dir, out_dir = Path(frames), Path(out)
    raw = {k: v for k, v in (("mode", mode), ("depth", depth), ("depth_x", depth_x), ("breaths", breaths),
                             ("lag", lag), ("rigid_row", rigid_row), ("chest_y", chest_y), ("chest_rx", chest_rx),
                             ("chest_ry", chest_ry), ("shoulder", shoulder), ("shoulder_lag", shoulder_lag),
                             ("chest_tilt", chest_tilt), ("chest_bias", chest_bias), ("chest_dir", chest_dir),
                             ("chest_x", chest_x), ("chest_bias_y", chest_bias_y), ("chest_flat", chest_flat),
                             ("inhale", inhale), ("breath_peaks", breath_peaks), ("loop_cells", loop_cells),
                             ("start_cell", start_cell), ("chest_round", chest_round), ("arms_x", arms_x),
                             ("axis_x", axis_x), ("torso_half", torso_half), ("width_min", width_min),
                             ("width_max", width_max), ("height_min", height_min), ("height_max", height_max))
           if v is not None}
    if avoid_region is None and (avoid_anchor is not None or fps is not None):
        raise SystemExit("breathe: --avoid-anchor 와 --fps 는 --avoid-region 의 것이다 — 손 상자 없이는 읽지 않는다")
    if avoid_region is not None and (breaths is not None or breath_peaks is not None):
        raise SystemExit("breathe: --avoid-region 은 숨 박자를 칸에서 고른다 — --breaths·--breath-peaks 와 같이 주지 마라")
    if avoid_region is not None and (loop_cells is not None or start_cell is not None):
        raise SystemExit("breathe: --avoid-region 은 숨 박자를 이 칸들에서 고른다 — 루프의 한 토막(--loop-cells·--start-cell)은 "
                         "그 루프의 박자를 잇는다. 박자는 루프의 칸에서 골라 그 값을 주라")
    cfg = _cli_breathe(raw)
    if avoid_region is not None and breathe_mode(cfg) != BREATHE_SMOOTH:
        raise SystemExit("breathe: --avoid-region 은 smooth 의 것이다 (--mode smooth) — pixel 숨은 진행파라 첫 칸이 쉼이 아니다")
    folder = open_frames(src_dir, out_dir, "breathe")      # 무엇을 만들거나 지우기 전에 — 실경로와 폴더 동일성으로 본다
    images = folder.images
    basis, held = reference_frame(reference, folder, "breathe")
    anat = resolve_anatomy(basis, cfg)            # 보고와 굽기가 같은 한 벌 — 큰 칸은 재는 데 0.5 초다
    beat = None
    if avoid_region is not None:
        from sprite_gen.effects import breath_beat      # 박자 고르기가 이 모듈을 읽는다 — 돌아 들어오지 않게 여기서
        frame_ms = cycle_frame_ms(src_dir, len(images), fps, "breathe")
        if frame_ms is None:
            raise SystemExit("breathe: --avoid-region 은 한 숨의 길이를 초로 본다 — --fps 를 주라 (video-loop 의 cycle/ "
                             "폴더면 루프의 strip meta 에서 읽는다)")
        chosen, beat = breath_beat.choose(images, smooth_lift(anat, cfg), smooth_inhale(cfg), avoid_region, avoid_anchor,
                                          frame_ms)
        cfg = _cli_breathe(raw | chosen)
    if props_groups is not None and props_mask is None and props_behind_mask is None:
        raise SystemExit("breathe: --props-groups 는 쥔 물건 마스크(--props-mask, --props-behind-mask)의 조각을 묶는다 — "
                         "마스크 없이는 묶을 조각이 없다")
    by_colour = props_groups == "colour"
    hold, kept = (None, None) if hold_mask is None else read_mask(hold_mask, images[0].size, "--hold-mask")
    props, grips = ((None, None) if props_mask is None
                    else read_mask(props_mask, images[0].size, "--props-mask", colours=by_colour))
    behind, backs = ((None, None) if props_behind_mask is None
                     else read_mask(props_behind_mask, images[0].size, "--props-behind-mask", colours=by_colour))
    resolved = anatomy_report(images, cfg, anat)
    pieces = {}
    baked, phases = bake_breathe_sequence(images, cfg, anat, hold, props, behind, record=pieces)
    for record, flag, back in ((grips, "--props-mask", False), (backs, "--props-behind-mask", True)):
        if record is None:
            continue
        if by_colour:
            record["groups"] = "colour"
        record["pieces"] = pieces["pins"].pieces(pieces["hidden"], behind=back, filled=pieces["filled"])
        for line in piece_warnings(record, flag):
            print(f"breathe: warning: {line}", file=sys.stderr)
    # 다 굽고 나서 한 번에 내놓는다 — 굽기가 중간에 거부되면 반쯤 찬 폴더를 남기지 않는다(frames.folder.publish).
    span = {} if pixel_round(cfg) else {"range": {k: list(v) for k, v in breathe_range(anat, cfg).items()}}
    publish(folder, baked, "breathe.json", {"frames": len(images), "source": str(src_dir), "config": cfg,
                                            "phases": phases, "resolved": resolved} | span
                                           | ({} if beat is None else {"beat": beat})
                                           | ({} if held is None else {"reference": held})
                                           | ({} if kept is None else {"hold": kept})
                                           | ({} if grips is None else {"props": grips})
                                           | ({} if backs is None else {"props_behind": backs}))
    if pixel_round(cfg):
        print(f"breathe: {len(images)} frames, pixel round chest, chest_round {cfg['chest_round']}, arms_x {cfg['arms_x']}, "
              f"breaths {cfg['breaths']} -> {out_dir}")
    elif _bounds(cfg) is not None:
        print(f"breathe: {len(images)} frames, {breathe_mode(cfg)}, width {cfg['width_min']}..{cfg['width_max']}, "
              f"height {cfg['height_min']}..{cfg['height_max']}, breaths {cfg['breaths']} -> {out_dir}")
    else:
        print(f"breathe: {len(images)} frames, {breathe_mode(cfg)}, depth {cfg['depth']}, "
              f"breaths {cfg['breaths']} -> {out_dir}")
    return 0
