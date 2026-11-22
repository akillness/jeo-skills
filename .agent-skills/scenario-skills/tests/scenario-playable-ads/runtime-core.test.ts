import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boot,
  FakeImage,
  loadRuntime,
  makeGame,
  restoreGlobals,
  setGlobal,
} from "./runtime-harness";

afterEach(() => {
  restoreGlobals();
  vi.restoreAllMocks();
});

describe("events", () => {
  it("records name, rounded real time and data on the shared __events list", async () => {
    const env = await loadRuntime();
    env.PA.realTime = 1.23456;
    env.PA.emit("score", { n: 3 });
    env.PA.emit("bare");
    expect(env.win.__events).toBe(env.PA.events);
    expect(env.events()).toEqual([
      { name: "score", t: 1.23, data: { n: 3 } },
      { name: "bare", t: 1.23, data: null },
    ]);
  });
});

describe("boot", () => {
  it("loads images, inits the game, exposes __qa and starts the loop when viewable", async () => {
    const env = await loadRuntime();
    const game = await boot(
      env,
      { images: { logo: "img:200x100", broken: "bad" } },
      makeGame({ qa: () => ({ score: 7 }) }),
    );
    expect(env.PA.img.logo).toBeInstanceOf(FakeImage);
    expect(env.PA.img.logo.width).toBe(200);
    // a failed image still resolves, so one bad asset never blocks the ad
    expect(env.PA.img.broken).toBeInstanceOf(FakeImage);
    expect(game.init).toHaveBeenCalledTimes(1);
    expect(env.win.__qa()).toEqual({ score: 7 });
    expect(env.events().map((e: any) => e.name)).toEqual(["start", "viewable"]);
    expect(env.raf).toHaveLength(1);
  });

  it("returns an empty QA object when the game has no qa()", async () => {
    const env = await loadRuntime();
    await boot(env);
    expect(env.win.__qa()).toEqual({});
  });

  it("registers the embedded font and still boots when it fails to load", async () => {
    const made: any[] = [];
    class FakeFontFace {
      constructor(
        public family: string,
        public source: string,
        public desc: unknown,
      ) {
        made.push(this);
      }
      load() {
        return this.family === "Bad"
          ? Promise.reject(new Error("x"))
          : Promise.resolve(this);
      }
    }
    for (const family of ["Good", "Bad"]) {
      const env = await loadRuntime({ win: { FontFace: FakeFontFace } });
      setGlobal("FontFace", FakeFontFace);
      const game = await boot(env, {
        font: family,
        fontData: "data:font/woff2;base64,AAAA",
      });
      expect(game.init).toHaveBeenCalled();
      expect(env.doc.fontsAdded).toHaveLength(family === "Good" ? 1 : 0);
    }
    expect(made[0].source).toBe("url(data:font/woff2;base64,AAAA)");
    expect(made[0].desc).toEqual({ weight: "700" });
  });
});

describe("scaling", () => {
  it("fits a portrait screen to 720 logical units and caps the pixel ratio at 2", async () => {
    const env = await loadRuntime({ width: 360, height: 640, dpr: 3 });
    await boot(env);
    const v = env.PA.view;
    expect(env.canvas.width).toBe(720);
    expect(env.canvas.height).toBe(1280);
    expect(env.canvas.style).toEqual({ width: "360px", height: "640px" });
    expect(v).toMatchObject({ dpr: 2, s: 0.5, gx: 0, w: 720, h: 1280 });
    expect(v.letterbox).toBe(false);
  });

  it("keeps the width at 720 on a tall screen and grows the logical height", async () => {
    const env = await loadRuntime({ width: 360, height: 800 });
    await boot(env);
    expect(env.PA.view).toMatchObject({ s: 0.5, w: 720, h: 1600 });
  });

  it("letterboxes a wide screen to a centered 9:16 play area", async () => {
    const env = await loadRuntime({ width: 1600, height: 900 });
    await boot(env);
    const v = env.PA.view;
    expect(v.letterbox).toBe(true);
    expect(v.gw).toBe(506);
    expect(v.gx).toBe(547);
    // 506 / 900 is a hair narrower than 9:16, so the width sets the scale
    expect(v.s).toBeCloseTo(506 / 720, 9);
    expect(v.w).toBeCloseTo(720, 9);
    expect(v.h).toBeCloseTo((900 * 720) / 506, 9);
  });

  it("maps logical and client coordinates as inverses", async () => {
    const env = await loadRuntime({ width: 1600, height: 900 });
    await boot(env);
    const c = env.PA.toClient(100, 200);
    expect(c.x).toBeCloseTo(547 + 100 * env.PA.view.s, 9);
    const l = env.PA.toLogical(c.x, c.y);
    expect(l.x).toBeCloseTo(100, 9);
    expect(l.y).toBeCloseTo(200, 9);
  });

  it("re-fits on window resize and tells the game", async () => {
    const env = await loadRuntime({ width: 360, height: 640 });
    const game = await boot(env, {}, makeGame({ resize: vi.fn() }));
    expect(game.resize).toHaveBeenCalledTimes(1);
    env.win.innerWidth = 1600;
    env.win.innerHeight = 900;
    env.win.fire("resize");
    expect(game.resize).toHaveBeenCalledTimes(2);
    expect(env.PA.view.letterbox).toBe(true);
    expect(env.canvas.width).toBe(1600);
  });
});

describe("eases", () => {
  it("hit their defining values", async () => {
    const { PA } = await loadRuntime();
    const e = PA.ease;
    expect(e.linear(0.3)).toBe(0.3);
    expect(e.outQuad(0.5)).toBe(0.75);
    expect(e.inQuad(0.5)).toBe(0.25);
    expect(e.inOutQuad(0.25)).toBe(0.125);
    expect(e.inOutQuad(0.75)).toBe(0.875);
    expect(e.outCubic(0.5)).toBe(0.875);
    expect(e.outBack(0)).toBeCloseTo(0, 12);
    expect(e.outBack(1)).toBe(1);
    expect(e.outBack(0.5)).toBeGreaterThan(1); // overshoots
    expect(e.outElastic(0)).toBe(0);
    expect(e.outElastic(1)).toBe(1);
    expect(e.outElastic(0.5)).toBeCloseTo(1.015625, 9);
  });
});

describe("tweens and timers", () => {
  it("interpolates on game time and calls done once at the end", async () => {
    const env = await loadRuntime();
    await boot(env);
    const o = { x: 0 };
    const done = vi.fn();
    env.PA.tween(o, { x: 100 }, 1, { ease: "linear", done });
    env.run(0.5);
    expect(o.x).toBeCloseTo(100 * env.PA.realTime, 6);
    env.run(0.6);
    expect(o.x).toBe(100);
    expect(done).toHaveBeenCalledTimes(1);
    o.x = 5;
    env.run(0.1);
    expect(o.x).toBe(5); // a finished tween no longer writes
  });

  it("uses the default outQuad ease", async () => {
    const env = await loadRuntime();
    await boot(env);
    const o = { x: 0 };
    env.PA.tween(o, { x: 1 }, 10);
    env.run(0.5);
    const p = env.PA.realTime / 10;
    expect(o.x).toBeCloseTo(p * (2 - p), 6);
  });

  it("reads start values when the delay ends", async () => {
    const env = await loadRuntime();
    await boot(env);
    const o = { x: 0 };
    env.PA.tween(o, { x: 100 }, 1, { delay: 0.3, ease: "linear" });
    env.run(0.2);
    expect(o.x).toBe(0);
    o.x = 50;
    env.run(0.3);
    expect(o.x).toBeGreaterThan(50);
    expect(o.x).toBeLessThan(100);
  });

  it("runs game-time tweens slower under slow-mo and real tweens unchanged", async () => {
    const env = await loadRuntime();
    await boot(env);
    env.PA.setTimeScale(0.5);
    const g = { x: 0 },
      r = { x: 0 };
    env.PA.tween(g, { x: 100 }, 10, { ease: "linear" });
    env.PA.tween(r, { x: 100 }, 10, { ease: "linear", real: true });
    env.run(1);
    expect(r.x).toBeCloseTo(10 * env.PA.realTime, 6);
    expect(g.x).toBeCloseTo(5 * env.PA.realTime, 6);
    expect(env.PA.time).toBeCloseTo(env.PA.realTime / 2, 9);
  });

  it("eases the time scale over real time and a later call wins", async () => {
    const env = await loadRuntime();
    await boot(env);
    env.PA.setTimeScale(0.2, 0.5);
    env.run(0.25);
    expect(env.PA.timeScale).toBeGreaterThan(0.2);
    expect(env.PA.timeScale).toBeLessThan(1);
    env.PA.setTimeScale(1);
    env.run(0.5);
    expect(env.PA.timeScale).toBe(1);
  });

  it("fires PA.after callbacks after the given seconds", async () => {
    const env = await loadRuntime();
    await boot(env);
    const fn = vi.fn();
    env.PA.after(0.5, fn);
    env.run(0.4);
    expect(fn).not.toHaveBeenCalled();
    env.run(0.2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("kills tweens by object and by property", async () => {
    const env = await loadRuntime();
    await boot(env);
    const o = { x: 0, y: 0 },
      other = { x: 0 };
    env.PA.tween(o, { x: 10 }, 1);
    env.PA.tween(o, { y: 10 }, 1);
    env.PA.tween(other, { x: 10 }, 1);
    env.PA.killTweens(o, "x");
    env.run(0.2);
    expect(o.x).toBe(0);
    expect(o.y).toBeGreaterThan(0);
    expect(other.x).toBeGreaterThan(0);
    env.PA.killTweens(other);
    const before = other.x;
    env.run(0.2);
    expect(other.x).toBe(before);
  });

  it("clearTweens drops pending timers and resets slow-mo", async () => {
    const env = await loadRuntime();
    await boot(env);
    const fn = vi.fn();
    env.PA.after(0.2, fn);
    env.PA.setTimeScale(0.3);
    env.PA.clearTweens();
    expect(env.PA.timeScale).toBe(1);
    env.run(0.5);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("main loop", () => {
  it("steps game time in fixed 1/60 s slices with a 0.05 s cap per frame", async () => {
    const env = await loadRuntime();
    const game = await boot(env);
    env.frame(1000); // first frame after a long gap still advances one tick
    expect(game.update).toHaveBeenCalledTimes(1);
    expect(env.PA.realTime).toBeCloseTo(1 / 60, 9);
    env.frame(1000);
    expect(game.update).toHaveBeenCalledTimes(4);
    expect(env.PA.realTime).toBeCloseTo(1 / 60 + 0.05, 9);
    const [gd, rd] = game.update.mock.calls[1];
    expect(gd).toBeCloseTo(1 / 60, 9);
    expect(rd).toBeCloseTo(1 / 60, 9);
    expect(game.draw.mock.calls[0][0]).toBe(env.rec.ctx);
  });

  it("passes slow-mo game time and real time to update", async () => {
    const env = await loadRuntime();
    const game = await boot(env);
    env.PA.setTimeScale(0.25);
    env.frame(16);
    const [gd, rd] = game.update.mock.calls[0];
    expect(gd).toBeCloseTo(rd * 0.25, 9);
  });

  it("speeds up under QA.speed and freezes under QA.pause", async () => {
    const qa: Record<string, unknown> = { speed: 4 };
    const env = await loadRuntime({ qa });
    const game = await boot(env);
    env.frame(50);
    env.frame(50);
    expect(env.PA.realTime).toBeCloseTo(4 / 60 + 0.2, 9);
    qa.pause = true;
    const n = game.update.mock.calls.length;
    env.frame(50);
    expect(game.update.mock.calls.length).toBe(n);
    expect(env.raf).toHaveLength(1); // still scheduled
  });

  it("pauses while the page is hidden", async () => {
    const env = await loadRuntime();
    const game = await boot(env);
    env.frame(16);
    env.doc.hidden = true;
    env.doc.fire("visibilitychange");
    const t = env.PA.realTime;
    env.run(1);
    expect(env.PA.realTime).toBe(t);
    env.doc.hidden = false;
    env.doc.fire("visibilitychange");
    env.frame(16);
    // the frame after a pause measures from the last held frame, not the time hidden
    expect(env.PA.realTime).toBeCloseTo(t + 0.016, 9);
    expect(game.update).toHaveBeenCalled();
  });

  it("clears with cfg.clearColor and draws a flash over the play area while it fades", async () => {
    const env = await loadRuntime();
    await boot(env, { clearColor: "#123456" });
    env.PA.flash("#ff0000", 0.8, 0.5);
    env.frame(16);
    const sets = env.rec.of("fillStyle=").map((a) => a[0]);
    expect(sets).toContain("#123456");
    expect(sets).toContain("#ff0000");
    expect(env.rec.of("fillRect")).toContainEqual([0, 0, 720, 1280]);
    env.run(0.6);
    env.rec.calls.length = 0;
    env.frame(16);
    expect(env.rec.of("fillStyle=").map((a) => a[0])).not.toContain("#ff0000");
  });
});

describe("shake", () => {
  it("decays to zero and only a stronger shake replaces a running one", async () => {
    const env = await loadRuntime();
    await boot(env);
    const PA = env.PA;
    expect(PA.shakeOffset()).toEqual({ x: 0, y: 0 });
    vi.spyOn(Math, "random").mockReturnValue(1); // offset = full current magnitude
    PA.shake(10, 1);
    expect(PA.shakeOffset().x).toBe(10);
    PA.shake(3, 1);
    expect(PA.shakeOffset().x).toBe(10);
    env.run(0.5);
    expect(PA.shakeOffset().x).toBeCloseTo(10 * (1 - PA.realTime), 6);
    PA.shake(8, 1); // stronger than what is left
    expect(PA.shakeOffset().x).toBe(8);
    env.run(1.1);
    expect(PA.shakeOffset()).toEqual({ x: 0, y: 0 });
  });
});

describe("idle states", () => {
  it("waits before the first touch and times out after 10 s without input", async () => {
    const env = await loadRuntime();
    await boot(env);
    expect(env.PA.idle()).toEqual({ wait: true, hint: true, timeout: false });
    env.run(10.1);
    expect(env.PA.idle().timeout).toBe(true);
  });

  it("hints after 2.5 s idle once touched, never while the finger is down", async () => {
    const env = await loadRuntime();
    await boot(env);
    env.frame(16);
    env.tap(100, 100);
    expect(env.PA.idle()).toEqual({ wait: false, hint: false, timeout: false });
    env.run(2.4);
    expect(env.PA.idle().hint).toBe(false);
    env.run(0.2);
    expect(env.PA.idle().hint).toBe(true);
    env.pointer("pointerdown", 100, 100);
    env.run(11);
    expect(env.PA.idle()).toEqual({ wait: false, hint: false, timeout: false });
  });
});

describe("input", () => {
  it("ignores taps before the container says the ad is viewable", async () => {
    const mraid = {
      addEventListener: vi.fn(),
      getState: () => "default",
      isViewable: () => false,
    };
    const env = await loadRuntime({ network: "mraid", win: { mraid } });
    const game = await boot(env);
    const e = env.pointer("pointerdown", 50, 50);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(env.PA.input.taps).toBe(0);
    expect(game.onDown).not.toHaveBeenCalled();
  });

  it("tracks one pointer in logical coordinates through down, move and up", async () => {
    const env = await loadRuntime();
    const game = await boot(env);
    env.frame(16);
    env.pointer("pointerdown", 100, 200, 7);
    expect(game.onDown).toHaveBeenCalledWith(200, 400);
    expect(env.PA.input).toMatchObject({
      down: true,
      sx: 200,
      sy: 400,
      taps: 1,
    });
    env.pointer("pointerdown", 10, 10, 8); // a second finger is ignored
    expect(game.onDown).toHaveBeenCalledTimes(1);
    expect(env.PA.input.taps).toBe(2);
    env.pointer("pointermove", 1, 1, 8);
    expect(game.onMove).not.toHaveBeenCalled();
    env.pointer("pointermove", 150, 250, 7);
    expect(game.onMove).toHaveBeenCalledWith(300, 500);
    env.pointer("pointerup", 0, 0, 8);
    expect(game.onUp).not.toHaveBeenCalled();
    env.pointer("pointerup", 0, 0, 7);
    expect(game.onUp).toHaveBeenCalledWith(300, 500);
    expect(env.PA.input.down).toBe(false);
    expect(env.events("firstTouch")).toHaveLength(1);
  });

  it("routes a tap to the topmost hit area of the last drawn frame", async () => {
    const env = await loadRuntime();
    const under = vi.fn(),
      over = vi.fn();
    let register = true;
    const game = await boot(
      env,
      {},
      makeGame({
        draw: () => {
          if (!register) return;
          env.PA.hit(0, 0, 400, 400, under);
          env.PA.hit(100, 100, 100, 100, over);
        },
      }),
    );
    env.PA.hit(0, 0, 720, 1280, under); // not drawn yet: no effect
    env.tap(10, 10);
    expect(under).not.toHaveBeenCalled();
    expect(game.onDown).toHaveBeenCalledTimes(1);
    env.frame(16);
    env.tap(75, 75); // logical 150,150: inside both
    expect(over).toHaveBeenCalledWith(150, 150);
    expect(under).not.toHaveBeenCalled();
    env.tap(25, 25);
    expect(under).toHaveBeenCalledWith(50, 50);
    expect(game.onDown).toHaveBeenCalledTimes(1);
    register = false;
    env.frame(16);
    env.tap(25, 25);
    expect(under).toHaveBeenCalledTimes(1);
    expect(game.onDown).toHaveBeenCalledTimes(2);
  });

  it("starts the music on the first counted tap", async () => {
    const env = await loadRuntime();
    await boot(env, { music: "bgm" });
    env.frame(16);
    expect(env.PA.audio.wantMusic).toBe(false);
    env.tap(100, 100);
    expect(env.PA.audio.wantMusic).toBe(true);
  });
});

describe("mute button", () => {
  it("toggles mute without counting as a move", async () => {
    const env = await loadRuntime();
    const game = await boot(env, { music: "bgm" });
    env.frame(16);
    // bottom-left by default: center 42 logical units from the edges
    expect(env.PA.muteRect).toEqual({ x: 21, y: 619 });
    env.tap(21, 619);
    expect(env.PA.audio.muted).toBe(true);
    expect(env.events("mute")[0].data).toEqual({ muted: true });
    expect(env.PA.input.taps).toBe(0);
    expect(env.PA.input.touched).toBe(false);
    expect(env.PA.audio.wantMusic).toBe(false);
    expect(game.onDown).not.toHaveBeenCalled();
    env.tap(21, 619);
    expect(env.PA.audio.muted).toBe(false);
  });

  it("draws a cross when muted and sound waves when not", async () => {
    const env = await loadRuntime();
    await boot(env);
    const waves = () => env.rec.of("arc").filter((a) => a[2] === 14).length;
    env.frame(16);
    expect(waves()).toBe(1);
    env.tap(21, 619);
    env.rec.calls.length = 0;
    env.frame(16);
    expect(waves()).toBe(0);
    expect(env.rec.of("lineTo")).toContainEqual([42 + 16, 1238 + 7]);
  });

  it.each([
    ["tl", { x: 21, y: 56 }],
    ["tr", { x: 339, y: 56 }],
    ["br", { x: 339, y: 619 }],
    [
      { x: -100, y: 200 },
      { x: 310, y: 100 },
    ],
    [
      { x: 100, y: -100 },
      { x: 50, y: 590 },
    ],
  ])("moves with cfg.mute %j", async (mute, rect) => {
    const env = await loadRuntime();
    await boot(env, { mute });
    env.frame(16);
    expect(env.PA.muteRect).toEqual(rect);
  });
});

describe("letterbox side panels", () => {
  it("draws a blurred background, the logo and a CTA in the side panels", async () => {
    const env = await loadRuntime({ width: 1600, height: 900 });
    await boot(env, {
      images: { bg: "img:100x50", logo: "img:400x200" },
      sideBg: "bg",
      logo: "logo",
      sideTint: "rgba(1,2,3,0.5)",
    });
    env.frame(16);
    // a full-size cache plus a tiny canvas drawn small and scaled up for the blur
    expect(env.created).toHaveLength(2);
    const [cache, tiny] = env.created;
    expect(cache.width).toBe(1600);
    expect(tiny.width).toBe(Math.round(1600 / 24));
    expect(cache.rec.of("fillStyle=")).toContainEqual(["rgba(1,2,3,0.5)"]);
    expect(cache.rec.of("drawImage")[0][0]).toBe(tiny);
    expect(tiny.rec.of("drawImage")[0][0]).toBe(env.PA.img.bg);
    const logo = env.rec.of("drawImage").find((a) => a[0] === env.PA.img.logo);
    expect(logo?.slice(3)).toEqual([420, 210]); // 0.8 of a 547 px panel, capped at 420
    env.frame(16);
    expect(env.created).toHaveLength(2); // cached between frames
    env.win.fire("resize");
    env.frame(16);
    expect(env.created).toHaveLength(4); // rebuilt after a resize
  });

  it("opens the store only from the side CTA, never from the empty panel", async () => {
    const env = await loadRuntime({ width: 1600, height: 900 });
    const game = await boot(env);
    env.frame(16);
    env.tap(100, 100);
    expect(env.win.open).not.toHaveBeenCalled();
    expect(game.onDown).not.toHaveBeenCalled();
    expect(env.PA.input.taps).toBe(1); // the tap still counts as a touch
    // the button is 320x96, centered in the right panel
    env.tap(1600 - 547 / 2, 450);
    expect(env.win.open).toHaveBeenCalledWith("https://and.example", "_blank");
    env.tap(1600 - 547 / 2, 450 + 60);
    expect(env.win.open).toHaveBeenCalledTimes(1);
  });

  it("drops the side CTA when the screen turns portrait", async () => {
    const env = await loadRuntime({ width: 1600, height: 900 });
    await boot(env);
    env.frame(16);
    env.win.innerWidth = 360;
    env.win.innerHeight = 640;
    env.win.fire("resize");
    env.rec.calls.length = 0;
    env.frame(16);
    expect(env.rec.of("drawImage")).toEqual([]);
    env.tap(340, 320);
    expect(env.win.open).not.toHaveBeenCalled();
  });

  it("skips the panel logo and CTA when the panels are too narrow", async () => {
    const env = await loadRuntime({ width: 720, height: 900 });
    const game = await boot(env, {
      images: { logo: "img:400x200" },
      logo: "logo",
    });
    expect(env.PA.view.letterbox).toBe(true);
    expect(env.PA.view.gx).toBe(107);
    env.frame(16);
    // the tinted panel background is still drawn, without a blurred image
    expect(env.created).toHaveLength(1);
    expect(env.rec.of("drawImage")[0][0]).toBe(env.created[0]);
    expect(env.rec.of("drawImage").some((a) => a[0] === env.PA.img.logo)).toBe(
      false,
    );
    env.tap(720 - 107 / 2, 450);
    expect(env.win.open).not.toHaveBeenCalled();
    expect(game.onDown).not.toHaveBeenCalled();
  });

  it("letterboxes only above a 3:4 aspect ratio", async () => {
    const at = await loadRuntime({ width: 750, height: 1000 });
    await boot(at);
    expect(at.PA.view.letterbox).toBe(false);
    expect(at.PA.view.gw).toBe(750);
    const above = await loadRuntime({ width: 760, height: 1000 });
    await boot(above);
    expect(above.PA.view.letterbox).toBe(true);
    expect(above.PA.view.gw).toBe(563);
  });
});
