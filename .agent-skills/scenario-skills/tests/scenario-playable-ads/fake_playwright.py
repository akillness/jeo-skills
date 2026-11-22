"""A stand-in for playwright.sync_api that plays a tiny simulated playable, so qa.py runs without a browser.

qa.py talks to the page only through evaluate, wait_for_function, the mouse and screenshots. This module
answers each JavaScript expression qa.py sends from a small game model (idle timeout, taps that score,
a win at GOAL taps, a loss after ROUND seconds, an end card with CTA and Replay, the network containers'
gating and CTA calls). An expression it does not know fails the test, so a change to qa.py's page
protocol shows up here instead of passing silently.

FAULTS names the broken behaviors to play, so a test can prove the matching check fails:
- hook and idle: frozen_hook, leak, audio_at_load, mute_starts_game, autoplay, no_progress, slow_idle,
  hangs_after_first_touch;
- game and replay: cant_win, no_lose, frozen_replay, replay_ends_at_once;
- CTA: store_on_first_tap, dead_pill, dead_endcard_cta, no_game_ready, late_game_end, no_retry, no_complete;
- gate: ignores_gate, never_viewable, early_touch, runs_while_hidden, loud_when_hidden, silent_after_resume.
"""

import re
from pathlib import Path

from PIL import Image, ImageDraw

GOAL = 7  # taps that win
ROUND = 6.0  # seconds after the first touch before a slow player loses
IDLE = 10.0  # the never-autoplay idle timeout that brings the end card
GATED = ("applovin", "unity", "mraid", "mintegral")
FIRST_TAP_NO_STORE = ("applovin", "unity", "mraid")
VIEWABLE_MS = 2500  # the fake MRAID and Mintegral containers start the ad 2.5 s after load
CTA_CALL = {"web": "FbPlayableAd.onCTAClick", "meta": "FbPlayableAd.onCTAClick", "moloco": "FbPlayableAd.onCTAClick",
            "google": "ExitApi.exit", "applovin": "mraid.open", "unity": "mraid.open", "mraid": "mraid.open",
            "mintegral": "install", "liftoff": "postMessage:download", "pangle": "openAppStore"}
EXTERNAL = {"google": "https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js",
            "pangle": "https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js"}
PILL, MUTE = {"x": 350, "y": 40}, {"x": 30, "y": 40}
CTA, REPLAY = {"x": 202, "y": 560}, {"x": 202, "y": 660}

FAULTS = set()
PAGES = []


class TimeoutError(Exception):  # shadows the builtin on purpose: qa.py imports it by this name
    pass


def near(x, y, rect):
    return abs(x - rect["x"]) <= 20 and abs(y - rect["y"]) <= 20


class Mouse:
    def __init__(self, page):
        self.page, self.x, self.y = page, 0.0, 0.0

    def move(self, x, y, steps=1):
        self.x, self.y = x, y
        self.page.mouse_log.append(("move", round(x, 2), round(y, 2)))

    def down(self):
        self.page.mouse_log.append(("down", round(self.x, 2), round(self.y, 2)))
        self.page.tap(self.x, self.y)

    def up(self):
        self.page.mouse_log.append(("up",))

    def click(self, x, y):
        self.x, self.y = x, y
        self.page.mouse_log.append(("click", round(x, 2), round(y, 2)))
        self.page.tap(x, y)


class Route:
    def __init__(self):
        self.fulfilled = None

    def fulfill(self, status, content_type, body):
        self.fulfilled = {"status": status, "content_type": content_type, "body": body}


class Message:
    def __init__(self, kind, text):
        self.type, self.text = kind, text


class Request:
    def __init__(self, url):
        self.url = url


class Page:
    def __init__(self, viewport):
        self.viewport_size = dict(viewport)
        self.mouse = Mouse(self)
        self.mouse_log, self.screenshots, self.routes, self.handlers = [], [], {}, {}
        self.net, self.speed, self.init = "web", 1.0, ""
        self.wall_ms, self.t, self.paused, self.hidden = 0, 0.0, False, False
        self.started = False
        self.touched, self.first_touch, self.last_tap, self.idle_from = False, None, None, 0.0
        self.score, self.result, self.endcard, self.endcard_due = 0, None, False, None
        self.muted, self.audio, self.events, self.cta = False, None, [], []
        PAGES.append(self)

    # wiring qa.py sets up before load
    def on(self, kind, handler):
        self.handlers.setdefault(kind, []).append(handler)

    def route(self, url, handler):
        self.routes[url] = handler

    def add_init_script(self, script):
        self.init = script
        self.speed = float(re.match(r"window\.__QA = \{ speed: ([0-9.]+) \};", script).group(1))

    def goto(self, url):
        self.net = Path(url.replace("file://", "")).parent.name
        self.emit("request", Request(url))
        self.emit("request", Request("data:image/webp;base64,AAAA"))
        self.emit("console", Message("log", "boot"))
        if self.net in EXTERNAL:
            route = Route()
            self.routes[EXTERNAL[self.net]](route)
            assert route.fulfilled["status"] == 200
            self.emit("request", Request(EXTERNAL[self.net]))
        if "leak" in FAULTS:
            self.emit("request", Request("https://tracker.invalid/pixel.gif"))
            self.emit("console", Message("error", "Uncaught ReferenceError: x is not defined"))
            self.emit("pageerror", "boom")
        if self.net == "mintegral" and "no_game_ready" not in FAULTS:
            self.cta.append("gameReady")
        if "audio_at_load" in FAULTS:
            self.audio = "running"
        self.started = self.net not in GATED or "ignores_gate" in FAULTS

    def emit(self, kind, arg):
        for h in self.handlers.get(kind, []):
            h(arg)

    # the simulated game
    def running(self):
        return self.started and (not self.hidden or "runs_while_hidden" in FAULTS) and not self.paused

    def advance(self, ms):
        for _ in range(int(ms // 10)):
            self.wall_ms += 10
            if not self.started and self.wall_ms >= VIEWABLE_MS and "never_viewable" not in FAULTS:
                self.started = True
                self.events.append({"name": "viewable", "t": self.t})
            if self.running():
                self.t = round(self.t + 0.01 * self.speed, 6)
                self.update()

    def update(self):
        if self.endcard or (self.touched and "hangs_after_first_touch" in FAULTS):
            return
        if self.result is None and self.touched:
            if self.score >= GOAL and "cant_win" not in FAULTS:
                self.finish("win")
            elif self.t - self.first_touch >= ROUND and "no_lose" not in FAULTS:
                self.finish("lose")
        idle = 20.0 if "slow_idle" in FAULTS else IDLE
        if self.result is None and self.t - (self.last_tap if self.touched else self.idle_from) >= idle:
            self.show_endcard()
        if self.endcard_due is not None and self.t >= self.endcard_due:
            self.show_endcard()

    def finish(self, result):
        self.result = result
        self.events.append({"name": "result", "t": self.t, "data": {"result": result}})
        self.endcard_due = self.t + 1.0

    def show_endcard(self):
        self.endcard, self.endcard_due = True, None
        self.events.append({"name": "endcard", "t": self.t})
        if self.net == "mintegral" and "late_game_end" not in FAULTS:
            self.cta.append("gameEnd")
        if self.net == "liftoff" and "no_complete" not in FAULTS:
            self.cta.append("postMessage:complete")

    def tap(self, x, y):
        if not self.started:
            if "early_touch" in FAULTS:
                self.touched, self.first_touch, self.last_tap = True, self.t, self.t
            return
        if near(x, y, MUTE):
            self.muted = not self.muted
            if "mute_starts_game" in FAULTS:
                self.touched, self.first_touch, self.last_tap = True, self.t, self.t
            return
        if self.endcard:
            if near(x, y, CTA) and "dead_endcard_cta" not in FAULTS:
                if self.net == "mintegral" and "late_game_end" in FAULTS:
                    self.cta.append("gameEnd")
                self.cta.append(CTA_CALL[self.net])
            elif near(x, y, REPLAY) and "frozen_replay" not in FAULTS:
                self.endcard, self.result, self.score, self.touched = False, None, 0, False
                self.idle_from = self.t
                if "replay_ends_at_once" in FAULTS:
                    self.events.append({"name": "endcard", "t": self.t})
                if self.net == "mintegral" and "no_retry" not in FAULTS:
                    self.cta.append("gameRetry")
            return
        first = not self.touched
        if first:
            self.touched, self.first_touch = True, self.t
        if self.audio is None:
            self.audio = "suspended" if self.hidden else "running"
        self.last_tap = self.t
        if near(x, y, PILL):
            if first and self.net in FIRST_TAP_NO_STORE and "store_on_first_tap" not in FAULTS:
                return
            if "dead_pill" not in FAULTS:
                self.cta.append(CTA_CALL[self.net])
            return
        self.score += 1
        self.events.append({"name": "pop", "t": self.t, "data": {"score": self.score}})

    def snapshot(self):
        progress = int(self.t) if "autoplay" in FAULTS else self.score
        snap = {"progress": progress, "scale": 0.5, "phase": "end" if self.endcard else "play",
                "cta": dict(CTA) if self.endcard else None}
        if "no_progress" in FAULTS:
            del snap["progress"]
        return snap

    def set_viewable(self, v):
        self.hidden = not v
        if self.audio and "loud_when_hidden" not in FAULTS and not (v and "silent_after_resume" in FAULTS):
            self.audio = "suspended" if self.hidden else "running"

    # the page API qa.py calls
    def evaluate(self, expr):
        simple = {
            "window.__events": lambda: [dict(e) for e in self.events],
            "window.__qa()": self.snapshot,
            "PA.realTime": lambda: self.t,
            "PA.pillRect": lambda: dict(PILL),
            "PA.muteRect || null": lambda: dict(MUTE),
            "PA.replayRect": lambda: dict(REPLAY) if self.endcard else None,
            "PA.replayRect || null": lambda: dict(REPLAY) if self.endcard else None,
            "PA.input.touched": lambda: self.touched,
            "PA.audio.muted": lambda: self.muted,
            "PA.audio.ctx === null": lambda: self.audio is None,
            "PA.audio.ctx ? PA.audio.ctx.state : null": lambda: self.audio,
            "window.__cta.slice()": lambda: list(self.cta),
            "window.__events.filter(e => e.name === 'endcard').length":
                lambda: sum(e["name"] == "endcard" for e in self.events),
        }
        if expr in simple:
            return simple[expr]()
        if expr == "window.__cta.splice(0)":
            calls, self.cta = self.cta, []
            return calls
        if expr in ("window.__QA.pause = true", "window.__QA.pause = false"):
            self.paused = expr.endswith("true")
            return self.paused
        m = re.fullmatch(r"window\.__fake\.setViewable\((true|false)\)", expr)
        if m:
            return self.set_viewable(m.group(1) == "true")
        if expr.startswith("Object.defineProperty(document, 'hidden'"):
            return None  # the tab turns visible; the container still hides the ad
        raise AssertionError(f"fake page: unknown expression {expr!r}")

    def condition(self, expr):
        if expr == "typeof window.__qa === 'function'":
            return True
        if expr == "window.PA && PA.pillRect":
            return self.started  # the in-play pill appears once the container lets the ad start
        if expr == "window.PA && PA.replayRect":
            return self.endcard
        if expr == "window.__events.some(e => e.name === 'viewable') || PA.realTime > 0":
            return any(e["name"] == "viewable" for e in self.events) or self.t > 0
        m = re.fullmatch(r"window\.__events\.some\(e => e\.name === [\"'](\w+)[\"']\)", expr)
        if m:
            return any(e["name"] == m.group(1) for e in self.events)
        m = re.fullmatch(r"PA\.realTime >= ([0-9.]+)", expr)
        if m:
            return self.t >= float(m.group(1))
        raise AssertionError(f"fake page: unknown condition {expr!r}")

    def wait_for_function(self, expr, timeout=30000):
        waited = 0
        while not self.condition(expr):
            if waited >= timeout:
                raise TimeoutError(f"timeout {timeout} ms waiting for {expr}")
            self.advance(50)
            waited += 50

    def wait_for_timeout(self, ms):
        self.advance(ms)

    def screenshot(self, path):
        w, h = self.viewport_size["width"], self.viewport_size["height"]
        im = Image.new("L", (w, h), 128)
        if not self.endcard:
            # vertical stripes that slide with game time, frozen before the first touch under "frozen_hook"
            shift = 0 if ("frozen_hook" in FAULTS and not self.touched) else int(self.t * 60)
            d = ImageDraw.Draw(im)
            for x0 in range(shift % 80 - 80, w, 80):
                d.rectangle((x0, 0, x0 + 39, h), fill=255)
                d.rectangle((x0 + 40, 0, x0 + 79, h), fill=0)
        im.convert("RGB").save(path)
        self.screenshots.append({"name": Path(path).name, "t": self.t, "paused": self.paused})


class Context:
    def __init__(self, viewport):
        self.viewport, self.closed = viewport, False

    def new_page(self):
        return Page(self.viewport)

    def close(self):
        self.closed = True


class Browser:
    def __init__(self):
        self.contexts, self.closed = [], False

    def new_context(self, viewport, device_scale_factor=1, has_touch=False):
        ctx = Context(viewport)
        self.contexts.append(ctx)
        return ctx

    def close(self):
        self.closed = True


class Chromium:
    def launch(self):
        return Browser()


class Playwright:
    chromium = Chromium()


class sync_playwright:  # a class, called like the real entry point
    def __enter__(self):
        return Playwright()

    def __exit__(self, *exc):
        return False


def reset(*faults):
    FAULTS.clear()
    FAULTS.update(faults)
    PAGES.clear()
