"""Playwright QA for a built playable.

Usage: python3 qa.py <project_dir> [--speed 2] [--only idle,active,fail,cta,shots]

Needs <project_dir>/qa_bot.py with:
  def active(snap, t) -> action      # a good player
  def fail(snap, t) -> action        # a player who loses (optional)
  STORYBOARD = [(name, trigger)]     # active run; trigger: {"time": s} | {"snap": fn} |
                                     #   {"event": n, "nth": k, "delay": s, "data": {key: value | {">=": v}}}
  STORYBOARD_IDLE = [(name, trigger)]  # optional: frames from the untouched run (near-fail ending)
  COMPARE = {storyboard_name: real_frame_path}   # paths relative to project_dir (optional)
  CTA_WAIT = "endcard"               # event after which the end-card CTA is clicked
  ACTIVE_LENGTH = (33, 52)           # optional: allowed end-card time of the active run, in seconds
Bots may read any field of the snapshot (game state such as vy, rest or ground, not only tap targets).
Actions: {"move": (dx, dy)} joystick-style drag from a fixed origin (unit vector, 0 = hold still),
         {"click": (x, y)} client coords, {"tap_rel": (fx, fy)} fraction of the viewport,
         {"drag": ((x1, y1), (x2, y2))} press, move in steps, release (client coords),
         None = no input (lift the finger).
The game exposes window.__qa() (snapshot with client-coordinate targets) and window.__events.

Checks: the untouched hook moves within 1.5 s and stays silent, the idle run and a touch-once-then-idle
run reach the end card (untouched: nothing plays, qa().progress stays 0, end card by 15 s), Replay restarts the game, the active run wins in 33-52 s, the fail run loses, both the in-play pill
(PA.pillRect) and the end-card CTA call the network API, zero network
requests, no console errors, file sizes under each network's limit. Writes qa/report.json and qa/*.png.
A partial run (--only) writes qa/report_<only>.json and leaves the full report.json alone.

Every network that was built (dist/<net>/index.html) gets its own fake container (FAKES_BY_NET): FbPlayableAd
(meta, moloco), ExitApi (google), mraid with a delayed ready and viewable (applovin, unity, mraid), Mintegral's
gameReady / gameStart / install / gameEnd / gameRetry, Liftoff's postMessage, the playable SDK's openAppStore (pangle).
  cta    the pill and the end-card button call that network's CTA API (API map below); on applovin, unity and
         mraid the viewer's first tap must not; mintegral also checks
         gameReady at load, gameEnd at the end card and gameRetry on Replay; liftoff checks 'complete' at the end card
  gate   (applovin, unity, mraid, mintegral) nothing runs before the container says viewable, it runs after,
         it pauses when the container hides the ad and resumes when it shows it again
  size / package   each built network's deliverable is under its cap; zip networks have index.html at the root
         (pangle also a config.json with playable_orientation)
A fake container proves the wiring, not the network's own validator: test in each network's preview tool.
Needs Playwright for Python with a Chromium build installed (python3 -m playwright install chromium).
"""
import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("--speed", type=float, default=2)
ap.add_argument("--only", default="hook,idle,touch_idle,active,fail,replay,cta,gate,shots")
ap.add_argument("--timeout", type=float, default=95, help="max in-game seconds per run")
args = ap.parse_args()
root = Path(args.project).resolve()
qa_dir = root / "qa"
qa_dir.mkdir(exist_ok=True)
spec = importlib.util.spec_from_file_location("qa_bot", root / "qa_bot.py")
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)
only = set(args.only.split(","))

PORTRAIT = {"width": 405, "height": 720}
EXITAPI = "https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"
PANGLE_SDK = "https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js"
MB = 1024 * 1024
# the call each network's container receives for a CTA tap
API = {"meta": "FbPlayableAd.onCTAClick", "google": "ExitApi.exit", "moloco": "FbPlayableAd.onCTAClick",
       "applovin": "mraid.open", "unity": "mraid.open", "mraid": "mraid.open", "mintegral": "install",
       "liftoff": "postMessage:download", "pangle": "openAppStore"}
GATED = ("applovin", "unity", "mraid", "mintegral")  # containers that say when the ad may start
FIRST_TAP_NO_STORE = ("applovin", "unity", "mraid")  # the viewer's first tap must not open the store
BASE = "window.__cta = []; window.__fake = {};\n"
FB = "window.FbPlayableAd = { onCTAClick: function () { window.__cta.push('FbPlayableAd.onCTAClick'); } };\n"
# a fake MRAID container: loading -> ready at 600 ms, viewable at 2500 ms; setViewable() plays the container hiding the ad
MRAID = """
(function () {
  var L = {}, state = 'loading', viewable = false;
  function fire(e, v) { (L[e] || []).slice().forEach(function (h) { h(v); }); }
  window.mraid = {
    getState: function () { return state; }, getVersion: function () { return '3.0'; },
    getPlacementType: function () { return 'interstitial'; }, isViewable: function () { return viewable; },
    addEventListener: function (e, h) { (L[e] = L[e] || []).push(h); },
    removeEventListener: function (e, h) { L[e] = (L[e] || []).filter(function (x) { return x !== h; }); },
    open: function (u) { window.__cta.push('mraid.open'); window.__fake.openUrl = u; },
    close: function () {}, expand: function () {}, useCustomClose: function () {}
  };
  setTimeout(function () { state = 'default'; fire('ready'); }, 600);
  setTimeout(function () { viewable = true; fire('viewableChange', true); fire('exposureChange', 100); }, 2500);
  window.__fake.setViewable = function (v) { viewable = v; fire('viewableChange', v); fire('exposureChange', v ? 100 : 0); };
})();
"""
# a fake Mintegral container: it defines gameReady and calls the game's gameStart 2.5 s later
MINTEGRAL = """
window.gameReady = function () {
  window.__cta.push('gameReady');
  setTimeout(function () { if (window.gameStart) window.gameStart(); }, 2500);
};
window.install = function () { window.__cta.push('install'); };
window.gameEnd = function () { window.__cta.push('gameEnd'); };
window.gameRetry = function () { window.__cta.push('gameRetry'); };
window.__fake.setViewable = function (v) { if (v) { if (window.gameStart) window.gameStart(); } else if (window.gameClose) window.gameClose(); };
"""
# Liftoff's container listens for postMessage; the test page is top level, so window.open is stubbed (no real store tab)
LIFTOFF = """
window.addEventListener('message', function (e) {
  if (e.data === 'download') window.__cta.push('postMessage:download');
  if (e.data === 'complete') window.__cta.push('postMessage:complete');
});
window.open = function () { window.__cta.push('window.open'); return null; };
"""
FAKES_BY_NET = {
    # "web" (local preview) gets both stand-ins, FbPlayableAd and ExitApi
    "web": BASE + FB + "window.__fakeExit = function () { window.ExitApi = { exit: function () { window.__cta.push('ExitApi.exit'); } }; };\n",
    "meta": BASE + FB, "moloco": BASE + FB,
    "google": BASE + "window.__fakeExit = function () { window.ExitApi = { exit: function () { window.__cta.push('ExitApi.exit'); } }; };\n",
    "applovin": BASE + MRAID, "unity": BASE + MRAID, "mraid": BASE + MRAID,
    "mintegral": BASE + MINTEGRAL, "liftoff": BASE + LIFTOFF, "pangle": BASE,
}
ALLOWED_EXTERNAL = {EXITAPI, PANGLE_SDK}
report = {"project": root.name, "speed": args.speed, "runs": {}, "checks": {}, "sizes": {}}


def built(net):
    return (root / "dist" / net / "index.html").exists()


def chromium(pw):
    return pw.chromium.launch()


def open_page(browser, net="web", viewport=PORTRAIT, speed=None):
    ctx = browser.new_context(viewport=viewport, device_scale_factor=2, has_touch=False)
    page = ctx.new_page()
    log = {"errors": [], "requests": []}
    page.on("console", lambda m: log["errors"].append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: log["errors"].append(f"pageerror: {e}"))
    page.on("request", lambda r: log["requests"].append(r.url)
            if not r.url.startswith(("data:", "file:", "blob:")) else None)
    if net == "google":
        # exitapi.js is google's allowed external file; serve a stand-in so the test stays offline
        page.route(EXITAPI, lambda route: route.fulfill(status=200, content_type="text/javascript",
                                                        body="window.__fakeExit();"))
    if net == "pangle":
        # the playable SDK is pangle's allowed external file; a stand-in that defines openAppStore
        page.route(PANGLE_SDK, lambda route: route.fulfill(
            status=200, content_type="text/javascript",
            body="window.openAppStore = function(){ window.__cta.push('openAppStore'); };"))
    page.add_init_script(f"window.__QA = {{ speed: {speed or args.speed} }};" + FAKES_BY_NET.get(net, FAKES_BY_NET["web"]))
    page.goto((root / "dist" / net / "index.html").as_uri())
    page.wait_for_function("typeof window.__qa === 'function'")
    return ctx, page, log


OPS = {">=": lambda a, b: a >= b, ">": lambda a, b: a > b, "<=": lambda a, b: a <= b, "<": lambda a, b: a < b,
       "!=": lambda a, b: a != b, "==": lambda a, b: a == b}


def data_match(data, want):
    """Storyboard filter: {"tier": 3} matches by equality, {"count": {">=": 3}} by comparison."""
    for k, v in want.items():
        got = (data or {}).get(k)
        if isinstance(v, dict):
            if got is None or not all(OPS[op](got, ref) for op, ref in v.items()):
                return False
        elif got != v:
            return False
    return True


def events(page):
    return page.evaluate("window.__events")


def has_event(evs, name):
    return any(e["name"] == name for e in evs)


def sim_time(page):
    return page.evaluate("PA.realTime")


def run(browser, mode, shots=False):
    ctx, page, log = open_page(browser)
    vw, vh = PORTRAIT["width"], PORTRAIT["height"]
    origin = (vw * 0.5, vh * 0.78)
    pressed = False
    once = {"done": False}

    def touch_once(snap, t):
        # one tap on the play area, then hands off: the 2.5 s hint returns and the 10 s idle timeout ends the ad
        if not once["done"] and t >= 0.8:
            once["done"] = True
            return {"tap_rel": (0.5, 0.55)}
        return None
    policy = {"active": getattr(bot, "active", None), "fail": getattr(bot, "fail", None),
              "touch_idle": touch_once}.get(mode)
    taken, board = set(), (list(getattr(bot, "STORYBOARD_IDLE" if mode == "idle" else "STORYBOARD", []))
                           if shots else [])
    t0 = time.time()
    max_prog, prog_missing = 0, False
    while True:
        evs = events(page)
        snap = page.evaluate("window.__qa()")
        if not has_event(evs, "endcard"):
            if snap.get("progress") is None:
                prog_missing = True
            else:
                max_prog = max(max_prog, snap["progress"])
        t = sim_time(page)
        if has_event(evs, "endcard") and t - next(e["t"] for e in evs if e["name"] == "endcard") > 1.5:
            break
        if t > args.timeout or time.time() - t0 > args.timeout / args.speed + 30:
            break
        for name, trig in board:
            if name in taken:
                continue
            fire = False
            if "time" in trig:
                fire = t >= trig["time"]
            elif "event" in trig:
                hits = [e for e in evs if e["name"] == trig["event"]
                        and data_match(e.get("data"), trig.get("data", {}))]
                k = trig.get("nth", 0)
                fire = len(hits) > k and t >= hits[k]["t"] + trig.get("delay", 0)
            elif "snap" in trig:
                fire = bool(trig["snap"](snap))
            if fire:
                # freeze the game so the bot does not lose time while Chromium captures
                page.evaluate("window.__QA.pause = true")
                page.screenshot(path=str(qa_dir / f"story_{name}.png"))
                page.evaluate("window.__QA.pause = false")
                taken.add(name)
        act = policy(snap, t) if policy else None
        if act and "click" in act:
            if pressed:
                page.mouse.up(); pressed = False
            page.mouse.click(*act["click"])
        elif act and "drag" in act:
            # press, travel in steps, release: merge and draw-line games
            if pressed:
                page.mouse.up(); pressed = False
            (x1, y1), (x2, y2) = act["drag"]
            page.mouse.move(x1, y1); page.mouse.down()
            page.mouse.move(x2, y2, steps=12)
            page.mouse.up()
        elif act and "tap_rel" in act:
            if pressed:
                page.mouse.up(); pressed = False
            page.mouse.click(vw * act["tap_rel"][0], vh * act["tap_rel"][1])
        elif act and "move" in act:
            dx, dy = act["move"]
            r = 70 * snap.get("scale", 0.5625)
            if not pressed:
                page.mouse.move(*origin); page.mouse.down(); pressed = True
            page.mouse.move(origin[0] + dx * r, origin[1] + dy * r)
        elif pressed:
            page.mouse.up(); pressed = False
        page.wait_for_timeout(40)
    evs = events(page)
    res = next((e["data"] for e in evs if e["name"] == "result"), None)
    end = next((e["t"] for e in evs if e["name"] == "endcard"), None)
    out = {"result": res and res.get("result"), "endcard_at": end, "events": evs,
           "errors": log["errors"], "requests": log["requests"],
           "max_progress": max_prog, "progress_missing": prog_missing}
    ctx.close()
    return out


def cta_check(browser, net):
    ctx, page, log = open_page(browser, net, speed=6)
    page.wait_for_function("window.PA && PA.pillRect", timeout=20000)
    page.wait_for_timeout(300)
    boot_calls = page.evaluate("window.__cta.slice()")  # what the container saw at load (Mintegral: gameReady)
    pill = page.evaluate("PA.pillRect")
    first_calls = None
    if net in FIRST_TAP_NO_STORE:  # the first tap only starts the game; the second may open the store
        page.mouse.click(pill["x"], pill["y"])
        page.wait_for_timeout(200)
        first_calls = page.evaluate("window.__cta.splice(0)")
    page.mouse.click(pill["x"], pill["y"])
    page.wait_for_timeout(200)
    pill_calls = page.evaluate("window.__cta.splice(0)")
    page.wait_for_function("window.__events.some(e => e.name === %s)" % json.dumps(getattr(bot, "CTA_WAIT", "endcard")),
                           timeout=60000)
    page.wait_for_timeout(500)
    end_calls = page.evaluate("window.__cta.slice()")  # what the container saw when the end card appeared
    target = page.evaluate("window.__qa()").get("cta")
    page.mouse.click(target["x"], target["y"])
    page.wait_for_timeout(300)
    calls = page.evaluate("window.__cta.slice()")
    retry_calls = None
    if net == "mintegral":
        rr = page.evaluate("PA.replayRect || null")
        if rr:
            page.mouse.click(rr["x"], rr["y"])
            page.wait_for_timeout(300)
            retry_calls = page.evaluate("window.__cta.slice()")
    out = {"boot_calls": boot_calls, "first_calls": first_calls, "pill_calls": pill_calls, "end_calls": end_calls, "calls": calls,
           "retry_calls": retry_calls, "errors": log["errors"],
           "requests": [u for u in log["requests"] if u not in ALLOWED_EXTERNAL]}
    ctx.close()
    return out


def gate_check(browser, net):
    """MRAID and Mintegral containers say when the ad may start: nothing may run before, it must run after, it
    must pause when the container hides the ad and resume when it shows it again (fake container timings:
    ready at 0.6 s, viewable or gameStart at 2.5 s). A tap before the start must do nothing, and a tab that turns
    visible while the container still hides the ad must not bring the sound back."""
    ctx, page, log = open_page(browser, net, speed=2)
    cx, cy = page.viewport_size["width"] / 2, page.viewport_size["height"] / 2
    page.wait_for_timeout(800)
    page.mouse.click(cx, cy)
    page.wait_for_timeout(100)
    before = {"real_time": page.evaluate("PA.realTime"),
              "touched": page.evaluate("PA.input.touched"),
              "viewable_event": any(e["name"] == "viewable" for e in events(page)),
              "audio_ctx_null": page.evaluate("PA.audio.ctx === null")}
    try:
        page.wait_for_function("window.__events.some(e => e.name === 'viewable') || PA.realTime > 0", timeout=15000)
    except PlaywrightTimeoutError:
        pass  # the ad never started: t_run stays 0 and gate_*_runs_after_viewable fails below
    page.wait_for_timeout(800)
    t_run = page.evaluate("PA.realTime")
    page.mouse.click(cx, cy)  # creates the AudioContext, so the hold below can be read on it
    page.wait_for_timeout(300)
    page.evaluate("window.__fake.setViewable(false)")
    page.wait_for_timeout(200)
    t_hold_a = page.evaluate("PA.realTime")
    page.evaluate("Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});"
                  "document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(800)
    t_hold_b = page.evaluate("PA.realTime")
    audio_held = page.evaluate("PA.audio.ctx ? PA.audio.ctx.state : null")
    page.evaluate("window.__fake.setViewable(true)")
    page.wait_for_timeout(800)
    t_resume = page.evaluate("PA.realTime")
    audio_resumed = page.evaluate("PA.audio.ctx ? PA.audio.ctx.state : null")
    ctx.close()
    return {"before": before, "t_run": t_run, "t_hold_a": t_hold_a, "t_hold_b": t_hold_b, "t_resume": t_resume,
            "audio_held": audio_held, "audio_resumed": audio_resumed,
            "errors": log["errors"], "requests": [u for u in log["requests"] if u not in ALLOWED_EXTERNAL]}


def hook_check(browser):
    """Untouched first seconds: something must move by 1.5 s, and audio must stay off before a touch."""
    ctx, page, log = open_page(browser, "web", speed=1)
    page.screenshot(path=str(qa_dir / "hook_0.0s.png"))
    page.wait_for_function("PA.realTime >= 1.5")
    page.screenshot(path=str(qa_dir / "hook_1.5s.png"))
    audio_off = page.evaluate("PA.audio.ctx === null")
    # the shared mute button: toggles, and does not start the game
    mute_ok = None
    r = page.evaluate("PA.muteRect || null")
    if r:
        page.mouse.click(r["x"], r["y"]); page.wait_for_timeout(150)
        on = page.evaluate("PA.audio.muted")
        page.mouse.click(r["x"], r["y"]); page.wait_for_timeout(150)
        off = page.evaluate("PA.audio.muted")
        started = page.evaluate("PA.input.touched")
        mute_ok = bool(on) and not off and not started
    ctx.close()
    a = Image.open(qa_dir / "hook_0.0s.png").convert("L").resize((90, 160))
    b = Image.open(qa_dir / "hook_1.5s.png").convert("L").resize((90, 160))
    changed = sum(1 for p, q in zip(a.tobytes(), b.tobytes()) if abs(p - q) > 24) / (90 * 160)
    return {"changed_pixels": round(changed, 4), "audio_off_before_touch": audio_off, "mute_ok": mute_ok,
            "errors": log["errors"], "requests": log["requests"]}


def replay_check(browser):
    """End card -> Replay: the game must restart (screen changes, no new end card at once, no errors)."""
    ctx, page, log = open_page(browser, "web", speed=6)
    page.wait_for_function("window.__events.some(e => e.name === 'endcard')", timeout=90000)
    page.wait_for_function("window.PA && PA.replayRect", timeout=5000)
    page.wait_for_timeout(400)
    page.evaluate("window.__QA.pause = true")
    page.screenshot(path=str(qa_dir / "replay_before.png"))
    page.evaluate("window.__QA.pause = false")
    n_end = page.evaluate("window.__events.filter(e => e.name === 'endcard').length")
    r = page.evaluate("PA.replayRect")
    page.mouse.click(r["x"], r["y"])
    t0 = page.evaluate("PA.realTime")
    page.wait_for_function(f"PA.realTime >= {t0 + 3}")
    page.evaluate("window.__QA.pause = true")
    page.screenshot(path=str(qa_dir / "replay_after.png"))
    still_end = page.evaluate("window.__events.filter(e => e.name === 'endcard').length") > n_end
    ctx.close()
    a = Image.open(qa_dir / "replay_before.png").convert("L").resize((90, 160))
    b = Image.open(qa_dir / "replay_after.png").convert("L").resize((90, 160))
    changed = sum(1 for p, q in zip(a.tobytes(), b.tobytes()) if abs(p - q) > 24) / (90 * 160)
    return {"changed_pixels": round(changed, 4), "new_endcard_within_3s": still_end,
            "errors": log["errors"], "requests": log["requests"]}


def orientation_shots(browser):
    for name, vp in (("portrait", PORTRAIT), ("landscape", {"width": 844, "height": 390}),
                     ("tablet", {"width": 768, "height": 1024})):
        ctx, page, log = open_page(browser, "web", vp, speed=1)
        page.wait_for_timeout(3500)
        page.screenshot(path=str(qa_dir / f"view_{name}.png"))
        ctx.close()


def compare_sheet():
    pairs = getattr(bot, "COMPARE", {})
    names = [n for n, _ in getattr(bot, "STORYBOARD", []) + getattr(bot, "STORYBOARD_IDLE", [])
             if (qa_dir / f"story_{n}.png").exists()]
    if not names:
        return
    H = 640
    font = ImageFont.load_default(size=26) if hasattr(ImageFont, "load_default") else None
    tiles = []
    for n in names:
        ad = Image.open(qa_dir / f"story_{n}.png").convert("RGB")
        ad = ad.resize((round(ad.width * H / ad.height), H))
        real = pairs.get(n)
        if real and (root / real).exists():
            im = Image.open(root / real).convert("RGB")
            im = im.resize((round(im.width * H / im.height), H))
            tile = Image.new("RGB", (ad.width + im.width + 12, H + 44), "white")
            tile.paste(im, (0, 44)); tile.paste(ad, (im.width + 12, 44))
            ImageDraw.Draw(tile).text((8, 8), f"{n}: real gameplay | playable", fill="black", font=font)
        else:
            tile = Image.new("RGB", (ad.width, H + 44), "white")
            tile.paste(ad, (0, 44))
            ImageDraw.Draw(tile).text((8, 8), n, fill="black", font=font)
        tiles.append(tile)
    W = sum(t.width for t in tiles) + 16 * (len(tiles) + 1)
    sheet = Image.new("RGB", (W, H + 44 + 32), "#e9eef5")
    x = 16
    for t in tiles:
        sheet.paste(t, (x, 16)); x += t.width + 16
    sheet.save(qa_dir / "storyboard_vs_real.jpg", quality=88)


with sync_playwright() as pw:
    browser = chromium(pw)
    if "hook" in only:
        report["runs"]["hook"] = hook_check(browser)
    if "idle" in only:
        report["runs"]["idle"] = run(browser, "idle", shots="shots" in only)
    if "touch_idle" in only:
        report["runs"]["touch_idle"] = run(browser, "touch_idle")
    if "active" in only:
        report["runs"]["active"] = run(browser, "active", shots="shots" in only)
    if "fail" in only and hasattr(bot, "fail"):
        report["runs"]["fail"] = run(browser, "fail")
    if "replay" in only:
        report["runs"]["replay"] = replay_check(browser)
    if "cta" in only:
        for net in API:
            if built(net):
                report["runs"][f"cta_{net}"] = cta_check(browser, net)
    if "gate" in only:
        for net in GATED:
            if built(net):
                report["runs"][f"gate_{net}"] = gate_check(browser, net)
    if "shots" in only:
        orientation_shots(browser)
        compare_sheet()
    browser.close()

R, C = report["runs"], report["checks"]
if "hook" in R:
    C["hook_moves_without_input"] = R["hook"]["changed_pixels"] >= 0.03
    C["audio_off_before_first_touch"] = R["hook"]["audio_off_before_touch"]
    C["mute_button_toggles_without_starting"] = bool(R["hook"].get("mute_ok"))
if "idle" in R:
    C["idle_reaches_endcard"] = R["idle"]["endcard_at"] is not None
    # never-autoplay rule: an untouched viewer sees nothing play, then the end card by the 10 s idle timeout
    C["idle_never_autoplays"] = not R["idle"]["progress_missing"] and R["idle"]["max_progress"] == 0
    C["idle_timeout_endcard_by_15s"] = R["idle"]["endcard_at"] is not None and R["idle"]["endcard_at"] <= 15
if "touch_idle" in R:
    C["touch_once_then_idle_reaches_endcard"] = R["touch_idle"]["endcard_at"] is not None
if "replay" in R:
    C["replay_restarts_game"] = R["replay"]["changed_pixels"] >= 0.15 and not R["replay"]["new_endcard_within_3s"]
if "active" in R:
    C["active_wins"] = R["active"]["result"] == "win"
    lo, hi = getattr(bot, "ACTIVE_LENGTH", (33, 52))
    C[f"active_length_{lo:g}_{hi:g}s"] = R["active"]["endcard_at"] is not None and lo <= R["active"]["endcard_at"] <= hi
if "fail" in R:
    C["fail_path_loses"] = R["fail"]["result"] not in (None, "win")
for net, api in API.items():
    if f"cta_{net}" in R:
        C[f"cta_{net}_endcard_calls_{api}"] = api in R[f"cta_{net}"]["calls"]
        C[f"cta_{net}_pill_calls_{api}"] = api in R[f"cta_{net}"]["pill_calls"]
        if net in FIRST_TAP_NO_STORE:
            first = R[f"cta_{net}"]["first_calls"]
            C[f"cta_{net}_first_tap_never_opens_store"] = first is not None and api not in first
if "cta_mintegral" in R:
    C["cta_mintegral_load_calls_gameReady"] = "gameReady" in R["cta_mintegral"]["boot_calls"]
    C["cta_mintegral_endcard_signals_gameEnd"] = "gameEnd" in R["cta_mintegral"]["end_calls"]
    C["cta_mintegral_replay_signals_gameRetry"] = "gameRetry" in (R["cta_mintegral"]["retry_calls"] or [])
if "cta_liftoff" in R:
    C["cta_liftoff_endcard_posts_complete"] = "postMessage:complete" in R["cta_liftoff"]["end_calls"]
for net in GATED:
    g = R.get(f"gate_{net}")
    if g:
        C[f"gate_{net}_nothing_runs_before_viewable"] = (g["before"]["real_time"] == 0 and not g["before"]["viewable_event"]
                                                         and g["before"]["audio_ctx_null"] and not g["before"]["touched"])
        C[f"gate_{net}_runs_after_viewable"] = g["t_run"] > 0.3
        C[f"gate_{net}_pauses_when_hidden"] = (abs(g["t_hold_b"] - g["t_hold_a"]) < 0.02
                                               and g["audio_held"] == "suspended")
        C[f"gate_{net}_resumes"] = g["t_resume"] > g["t_hold_b"] + 0.3 and g["audio_resumed"] == "running"
C["zero_network_requests"] = all(not r.get("requests") for r in R.values())
C["no_console_errors"] = all(not r.get("errors") for r in R.values())
# size: meta's HTML <= 2 MB, google's ZIP <= 5 MB, every other built network's deliverable <= 5 MB
import zipfile
for net in API:
    if not built(net):
        continue
    d = root / "dist" / net
    z = d / f"{root.name}-{net}.zip"
    if net == "meta":
        f, limit = d / "index.html", 2 * MB
    elif net == "google":
        f, limit = z, 5 * MB
    else:
        f, limit = (z if z.exists() else d / "index.html"), 5 * MB
    if f.exists():
        report["sizes"][net] = f.stat().st_size
        C[f"{net}_size_ok"] = f.stat().st_size <= limit
    if net in ("google", "liftoff", "pangle", "meta") and z.exists():
        names = zipfile.ZipFile(z).namelist()
        ok = "index.html" in names
        if net == "pangle":
            try:
                ok = ok and "playable_orientation" in json.loads(zipfile.ZipFile(z).read("config.json"))
            except (KeyError, ValueError):
                ok = False
        C[f"package_ok_{net}"] = ok
full = only == set(ap.get_default("only").split(","))
name = "report.json" if full else "report_" + "+".join(sorted(only)) + ".json"
(qa_dir / name).write_text(json.dumps(report, indent=2))
for k, v in C.items():
    print(("PASS " if v else "FAIL ") + k)
for name, r in R.items():
    print(f"{name}: result={r.get('result')} endcard_at={r.get('endcard_at')} calls={r.get('calls')} "
          f"errors={len(r.get('errors', []))} requests={len(r.get('requests', []))}")
sys.exit(0 if all(C.values()) else 1)
