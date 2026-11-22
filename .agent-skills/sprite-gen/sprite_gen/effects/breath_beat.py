# SPDX-License-Identifier: Apache-2.0
"""손을 비키는 숨 박자 — `sprite-gen breathe --avoid-region` (smooth).

큰 일러 idle 에서 손이 가슴 앞을 오르내리면, 들숨 꼭대기가 손이 크게 오르는 칸에 떨어질 때 숨이 손을 따라 오르는
것처럼 읽히거나 가슴이 손 밑으로 묻힌다. 숨 박자(숨 수 `breaths` 또는 들숨 꼭대기 칸 `breath_peaks`)를 칸의
움직임에서 고른다 — 손으로 숨 수를 바꿔 보던 일을 엔진이 같은 잣대로 한다:

- 손 상자(`--avoid-region`)와 그 위 몸 상자(`--avoid-anchor`, 생략하면 손 상자 바로 위 띠 `anchor_band`)를 첫 칸
  기준 마스크 NCC 로 따라간다(`auto_motion.track_box`, 정수 px). 손의 제 오름 = 손 − 몸, 몸 오름 = 몸 (위 양수).
- 후보는 한 숨이 `PERIOD_S` 안인 숨 수 k 를 고르게 둔 것, 그리고 고른 k 의 꼭대기를 앞뒤 `NUDGE` 칸까지 민 것이다
  (k 가 3 이하면 꼭대기마다 따로, 넘으면 다 같이). 곡선은 굽기와 같은 `breathe.smooth_wave` 다 — 같은 들숨 몫(`inhale`)으로.
- 점수 = 상관(숨, 몸 오름) − 상관(숨, 손 오름). 숨이 손과 같이 오르내리지 않고 영상의 몸과 같이 가면 높다.
- 조건: 들숨 꼭대기마다 앞뒤 `NEAR` 칸에서 가슴 오름(가슴 오름 px × 숨) 이 손의 제 오름보다 낮지 않다 — 가슴이
  손 위에 있다. 가슴 오름 px 는 굽기가 쓰는 그 값(`breathe.smooth_lift`)이다.
- 규칙(`pick`): 조건을 지키는 고르게 둔 후보 가운데 점수가 가장 높은 것. 꼭대기를 민 후보는 그보다 점수가
  `MARGIN` 넘게 나을 때만 쓴다. 조건을 지키는 후보가 없으면 조용히 하나를 고르지 않고 멈춘다.

`MARGIN` 과 `anchor_band` 의 띠는 몇 판에서 고른 값이다 — 판이 늘면 다시 잰다. 고른 박자와 후보 표는 breathe.json
`beat` 에 남고, 그 파일을 받는 Sway 레이어(`video-sway --breathe`)는 같은 박자로 흔든다."""

from __future__ import annotations

import itertools
import math
from typing import Any

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.curate.curation import BREATHE_BREATHS_MAX, BREATHE_SMOOTH
from sprite_gen.effects import breathe
from sprite_gen.video import auto_motion

PERIOD_S = (1.5, 4.0)  # 한 숨의 길이(초) — 숨 수 후보를 이 안에서 고른다
NUDGE = 3              # 꼭대기를 앞뒤로 미는 칸 수
NEAR = 2               # 꼭대기 앞뒤 이 칸 안에서 손의 제 오름을 본다
PEAK_LEVEL = 0.9       # 숨 곡선의 이 값을 넘는 꼭대기 칸이 들숨 꼭대기다
MARGIN = 0.1           # 꼭대기를 민 후보가 고르게 둔 것보다 이만큼 넘게 나아야 쓴다
ANCHOR_BAND = (0.65, 0.02)  # 몸 상자 기본값: 손 상자 위 (손 높이의 이 몫 ~ 그림 높이의 이 몫 위) 띠, 같은 열
SEARCH = 0.05          # 따라가는 반경 — 그림의 긴 변의 몫, 적어도 8 px
SEARCH_MIN = 8


def anchor_band(avoid: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """`--avoid-anchor` 생략 시 몸 상자 — 손 상자와 같은 열, 손 상자 위 손 높이의 `ANCHOR_BAND[0]` 몫부터 그림 높이의
    `ANCHOR_BAND[1]` 몫 위까지 (그림 비율)."""
    x0, y0, x1, y1 = avoid
    return x0, max(0.0, y0 - ANCHOR_BAND[0] * (y1 - y0)), x1, y0 - ANCHOR_BAND[1]


def _px(box: tuple[float, float, float, float], size: tuple[int, int]) -> tuple[int, int, int, int]:
    w, h = size
    return round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a - a.mean(), b - b.mean()
    d = math.sqrt(float((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d else 0.0


def _row(beat: dict, n: int, hands: np.ndarray, body: np.ndarray, lift: float, inhale: float) -> dict[str, Any]:
    """한 박자 후보의 점수와 조건 — 그 박자와 들숨 몫으로 굽기가 쓸 위상과 곡선에서."""
    phases = breathe.fit_breathe_pattern(n, {"mode": BREATHE_SMOOTH, "inhale": inhale, **beat})
    w = np.asarray([breathe.smooth_wave(p, inhale) for p in phases])
    peaks = [i for i in range(n) if w[i] > PEAK_LEVEL and w[i] >= w[i - 1] and w[i] >= w[(i + 1) % n]]
    margin = min(lift * w[p] - max(hands[(p + j) % n] for j in range(-NEAR, NEAR + 1)) for p in peaks)
    corr_hands, corr_body = _corr(w, hands), _corr(w, body)
    return {**beat, "peaks": peaks, "score": corr_body - corr_hands, "corr_hands": corr_hands, "corr_body": corr_body,
            "margin_px": float(margin), "keeps": bool(margin >= 0)}


def candidates(n: int, frame_ms: float) -> list[int]:
    """숨 수 후보 — 한 숨이 `PERIOD_S` 안인 k."""
    return [k for k in range(1, BREATHE_BREATHS_MAX + 1) if PERIOD_S[0] <= n * frame_ms / 1000 / k <= PERIOD_S[1]]


def nudged(n: int, k: int, inhale: float) -> list[list[int]]:
    """숨 k 번을 고르게 둔 꼭대기(숨마다 들숨 몫 `inhale` 자리)를 앞뒤 `NUDGE` 칸까지 민 꼭대기 목록들 — 첫 칸은 쉼,
    마지막 꼭대기 뒤에 날숨이 들어갈 두 칸, 꼭대기 사이 두 칸 이상(curation 의 breath_peaks 검사와 _peaked_phases 의
    끝 검사)."""
    base = [round((i + inhale) * n / k) for i in range(k)]
    span = range(-NUDGE, NUDGE + 1)
    moves = itertools.product(span, repeat=k) if k <= 3 else ((m,) * k for m in span)
    out = []
    for move in moves:
        peaks = [p + m for p, m in zip(base, move)]
        if any(move) and peaks[0] >= 1 and peaks[-1] <= n - 2 and all(b - a >= 2 for a, b in zip(peaks, peaks[1:])):
            out.append(peaks)
    return out


def pick(evenly: list[dict[str, Any]], pushed: list[dict[str, Any]]) -> dict[str, Any]:
    """규칙 — 조건을 지키는 고르게 둔 후보 가운데 점수 최고(같으면 숨이 적은 쪽), 꼭대기를 민 후보는 그보다 `MARGIN`
    넘게 나을 때만. 조건을 지키는 고르게 둔 후보가 없으면 멈춘다."""
    kept = [row for row in evenly if row["keeps"]]
    if not kept:
        least = max(evenly, key=lambda row: row["margin_px"])
        raise SystemExit(f"breathe: --avoid-region — 어느 숨 수로도 들숨 꼭대기에서 가슴이 손 위에 있지 않다 (가장 나은 "
                         f"breaths {least['breaths']} 도 가슴 오름이 손의 제 오름보다 {-least['margin_px']:.2f} px 낮다). "
                         f"손 상자를 확인하거나 depth 를 올리거나 --breaths 로 정해라. 조용히 고르지 않는다.")
    best = max(kept, key=lambda row: (row["score"], -row["breaths"]))
    top = max((row for row in pushed if row["keeps"]), key=lambda row: row["score"], default=None)
    return top if top is not None and top["score"] > best["score"] + MARGIN else best


def choose(images: list[Image.Image], lift: float, inhale: float, avoid: tuple[float, float, float, float],
           anchor: tuple[float, float, float, float] | None, frame_ms: float) -> tuple[dict[str, Any], dict[str, Any]]:
    """`images`(숨 넣기 전 칸들)에서 고른 숨 박자(`{"breaths": k}` 또는 `{"breath_peaks": [...]}`)와 breathe.json 에
    남길 `beat` 기록 — 곡선은 줄의 들숨 몫 `inhale` 의 것이다."""
    n = len(images)
    size = images[0].size
    anchor = anchor_band(avoid) if anchor is None else anchor
    boxes = {"hands": _px(avoid, size), "body": _px(anchor, size)}
    radius = max(SEARCH_MIN, round(SEARCH * max(size)))
    moves = {}
    for name, box in boxes.items():
        try:
            moves[name] = auto_motion.track_box(images, box, radius)
        except ValueError as exc:
            flag = "--avoid-region" if name == "hands" else "--avoid-anchor"
            raise SystemExit(f"breathe: {flag} 상자 {list(box)} px 를 칸마다 따라가지 못한다 — {exc}") from exc
    body = -moves["body"][:, 1]
    hands = -moves["hands"][:, 1] - body
    ks = candidates(n, frame_ms)
    if not ks:
        raise SystemExit(f"breathe: --avoid-region — 루프가 {n * frame_ms / 1000:g} 초라 {PERIOD_S[0]:g}~{PERIOD_S[1]:g} 초 "
                         f"숨이 정수 번 들어가지 않는다. --breaths 로 정해라.")
    evenly = [_row({"breaths": k}, n, hands, body, lift, inhale) for k in ks]
    best = pick(evenly, [])
    pushed = [_row({"breath_peaks": peaks}, n, hands, body, lift, inhale) for peaks in nudged(n, best["breaths"], inhale)]
    chosen = pick(evenly, pushed)
    beat = {"breaths": chosen["breaths"]} if "breaths" in chosen else {"breath_peaks": chosen["breath_peaks"]}
    top = max(pushed, key=lambda row: (row["keeps"], row["score"]), default=None)
    record = {
        "avoid_region": list(avoid), "avoid_anchor": list(anchor), "boxes_px": {k: list(v) for k, v in boxes.items()},
        "search_px": radius, "frame_ms": frame_ms, "lift_px": round(lift, 4),
        "hands_rise_px": hands.tolist(), "body_rise_px": body.tolist(),
        "rule": {"period_s": list(PERIOD_S), "nudge": NUDGE, "near": NEAR, "margin": MARGIN},
        "candidates": [_rounded(row) for row in evenly], "nudged_best": None if top is None else _rounded(top),
        "chosen": beat,
    }
    return beat, record


def _rounded(row: dict[str, Any]) -> dict[str, Any]:
    return {k: round(v, 4) if isinstance(v, float) else v for k, v in row.items()}
