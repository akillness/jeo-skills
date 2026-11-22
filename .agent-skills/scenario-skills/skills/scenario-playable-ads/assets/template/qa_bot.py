"""QA policies for the playable (read by the skill's scripts/qa.py).

active(snap, t) plays like a good player and must win; fail(snap, t) plays badly (slow, so it keeps touching
but falls short) and must lose. Both make the first touch themselves: the game never plays a move for anyone.
Return one action per tick or None:
  {"click": (x, y)} | {"tap_rel": (fx, fy)} | {"drag": ((x1, y1), (x2, y2))} | {"move": (dx, dy)} | None
All coordinates are client pixels; the game's qa() snapshot already converts its targets.
"""
_last = {"active": -1.0, "fail": -1.0}
PACE = 0.3        # seconds between taps for the good player (game time)
FAIL_PACE = 1.6   # a slow, distracted player: ends about 10 pops short of the goal


def _ready(key, t, gap):
    if t < _last[key]:          # a new run started: the clock went back to 0
        _last[key] = -1.0
    if t - _last[key] < gap:
        return False
    _last[key] = t
    return True


def _highest(s):
    return min(s["pieces"], key=lambda q: q["y"]) if s["pieces"] else None


def active(s, t):
    if s["phase"] not in ("wait", "play") or t < 0.4 or not s["pieces"] or not _ready("active", t, PACE):
        return None
    p = _highest(s)  # the highest piece first, like a human reading top-down
    return {"click": (p["x"], p["y"])}


def fail(s, t):
    if s["phase"] not in ("wait", "play") or t < 0.4 or not _ready("fail", t, FAIL_PACE):
        return None
    p = _highest(s)
    return {"click": (p["x"], p["y"])} if p else {"click": (s["empty"]["x"], s["empty"]["y"])}


# storyboard frames from the active run, matched to real gameplay frames in COMPARE
STORYBOARD = [
    ("1-hook", {"time": 0.3}),
    ("2-core-loop", {"event": "pop", "nth": 3, "delay": 0.2}),
    ("3-payoff", {"event": "payoff", "delay": 0.3}),
    ("3b-late-play", {"event": "pop", "data": {"score": {">=": 30}}, "delay": 0.2}),   # comparison filter
    ("4-result", {"event": "result", "delay": 0.8}),
    ("5-end-card", {"event": "endcard", "delay": 1.0}),
]
# frames from the untouched run: the waiting hook (nothing plays) and the idle-timeout end card
STORYBOARD_IDLE = [
    ("6-idle-hook", {"time": 0.6}),   # after the hook banner has popped in (0.1 s delay + 0.45 s tween)
    ("7-idle-waiting", {"time": 5.0}),
    ("8-idle-end-card", {"event": "endcard", "delay": 1.0}),
]
COMPARE = {
    # "1-hook": "intake/screenshot.png",
    # "3-payoff": "analysis/frames/f_5.5.png",
}
CTA_WAIT = "endcard"
# ACTIVE_LENGTH = (33, 52)   # optional: the allowed end-card time of the active run, in seconds
