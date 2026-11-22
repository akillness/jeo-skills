import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// game.js is a classic script that reads window.PA and window.GAME_CFG. The fake PA below keeps the
// runtime's contract (tweens and PA.after on one clock, idle flags the test sets, a recording 2D
// context) so the template's own rules run unchanged. Math.random is pinned to 0.5: every piece sits
// at x = 360 with vy = 205, stacked 160 px apart from y = 470.
const GAME = "../../skills/scenario-playable-ads/assets/template/src/game.js";
const STEP = 1 / 60;

type Call = { k: string; a: any[] };
type Tween = {
  obj: any;
  to: Record<string, number>;
  from: Record<string, number>;
  dur: number;
  t: number;
  done?: () => void;
};

function image(name: string, width: number, height: number) {
  return { name, width, height };
}

function makeFx() {
  return {
    parts: [] as any[],
    texts: [] as any[],
    bursts: [] as { x: number; y: number; o: any }[],
    burst(x: number, y: number, o: any) {
      this.bursts.push({ x, y, o });
      this.parts.push(o);
    },
    text(x: number, y: number, s: string, o: any) {
      this.texts.push({ x, y, s, o });
    },
    update() {},
    draw() {},
  };
}

function makePA() {
  const tweens: Tween[] = [];
  const events: { name: string; data: any }[] = [];
  const sounds: any[][] = [];
  const ducks: any[][] = [];
  const draws: Call[] = [];
  const fxs: ReturnType<typeof makeFx>[] = [];
  const record =
    (k: string) =>
    (...a: any[]) => {
      draws.push({ k, a });
    };
  const PA: any = {
    view: { w: 720, h: 1280, s: 1, gx: 0, gy: 0 },
    img: {
      bg: image("bg", 100, 100),
      piece: image("piece", 10, 10),
      star: image("star", 10, 20),
      coin: image("coin", 10, 10),
      logo: image("logo", 200, 100),
    },
    realTime: 0,
    idleState: { timeout: false, hint: false },
    ease: { outBack: (t: number) => t },
    draw: {
      rrect: record("rrect"),
      text: record("text"),
      ctaPill: record("ctaPill"),
      hintHand: record("hintHand"),
      banner: record("banner"),
    },
    audio: {
      play: (...a: any[]) => sounds.push(a),
      duck: (...a: any[]) => ducks.push(a),
    },
    events,
    sounds,
    ducks,
    draws,
    fxs,
    tweens,
    calls: { resetEndCard: 0, clearTweens: 0, shake: [] as any[] },
    makeFx() {
      const f = makeFx();
      fxs.push(f);
      return f;
    },
    tween(obj: any, to: any, dur: number, opts: any = {}) {
      tweens.push({
        obj,
        to,
        from: {},
        dur,
        t: -(opts.delay || 0),
        done: opts.done,
      });
    },
    after(sec: number, fn: () => void) {
      PA.tween({}, {}, sec, { done: fn });
    },
    clearTweens() {
      tweens.length = 0;
      PA.calls.clearTweens++;
    },
    resetEndCard() {
      PA.calls.resetEndCard++;
    },
    emit(name: string, data: any) {
      events.push({ name, data });
    },
    shake(...a: any[]) {
      PA.calls.shake.push(a);
    },
    flash: record("flash"),
    shakeOffset: () => ({ x: 0, y: 0 }),
    idle: () => PA.idleState,
    toClient: (x: number, y: number) => ({
      x: PA.view.gx + x * PA.view.s,
      y: PA.view.gy + y * PA.view.s,
    }),
    drawEndCard: record("drawEndCard"),
    boot(cfg: any, game: any) {
      PA.booted = { cfg, game };
    },
    // the runtime's frame order: tweens and timers first, then game.update, in fixed small steps
    runTimers(sec: number) {
      for (let left = sec; left > 1e-9; left -= STEP) {
        const d = Math.min(STEP, left);
        PA.realTime += d;
        for (let i = tweens.length - 1; i >= 0; i--) {
          const tw = tweens[i];
          tw.t += d;
          if (tw.t < 0) continue;
          for (const k in tw.to) if (!(k in tw.from)) tw.from[k] = tw.obj[k];
          const p = Math.min(1, tw.t / tw.dur);
          for (const k in tw.to)
            tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * p;
          if (p >= 1) {
            tweens.splice(tweens.indexOf(tw), 1);
            if (tw.done) tw.done();
          }
        }
      }
    },
  };
  return PA;
}

function recorder() {
  const log: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get:
      (_, k: string) =>
      (...a: unknown[]) => {
        log.push({ k, a });
      },
    set: (_, k: string, v) => {
      log.push({ k: "=" + k, a: [v] });
      return true;
    },
  });
  return { ctx, log };
}

const cfg = { images: {}, marker: "cfg" };
let PA: any;
let game: any;

async function load() {
  vi.resetModules();
  PA = makePA();
  (globalThis as any).PA = PA;
  (globalThis as any).window = { GAME_CFG: cfg };
  await import(GAME);
  game = PA.booted.game;
  game.init();
}

function step(sec: number) {
  for (let left = sec; left > 1e-9; left -= STEP) {
    const d = Math.min(STEP, left);
    PA.runTimers(d);
    game.update(d);
  }
}

function frame() {
  const { ctx, log } = recorder();
  PA.draws.length = 0;
  game.draw(ctx);
  return { log, hud: PA.draws as Call[] };
}

// world pieces as drawn this frame: center and the image used
function drawnPieces() {
  return frame()
    .log.filter(
      (c) =>
        c.k === "drawImage" &&
        (c.a[0] === PA.img.piece || c.a[0] === PA.img.star),
    )
    .map((c) => ({
      img: c.a[0].name,
      x: c.a[1] + c.a[3] / 2,
      y: c.a[2] + c.a[4] / 2,
    }));
}

function tap(x: number, y: number) {
  game.onDown(x, y);
}

function names() {
  return PA.events.map((e: any) => e.name);
}

function event(name: string) {
  return PA.events.find((e: any) => e.name === name);
}

function stepUntil(phase: string) {
  for (let i = 0; i < 60 * 60 && game.qa().phase !== phase; i++) step(STEP);
  expect(game.qa().phase).toBe(phase);
}

function waitForPiece() {
  for (let i = 0; i < 600 && !game.qa().pieces.length; i++) step(0.05);
}

// pops the highest piece qa() exposes, waiting for one to rise into view
function popOne() {
  for (let i = 0; i < 600; i++) {
    const s = game.qa();
    if (s.phase !== "play" && s.phase !== "wait") throw new Error("round over");
    if (s.pieces.length) {
      const p = s.pieces.reduce((a: any, b: any) => (b.y < a.y ? b : a));
      const before = s.score;
      tap(p.x, p.y);
      if (game.qa().score > before) return;
    }
    step(0.05);
  }
  throw new Error("no piece reached the screen");
}

beforeEach(async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  await load();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).PA;
  delete (globalThis as any).window;
});

describe("boot and wait", () => {
  it("boots the runtime with the page config and the game hooks", () => {
    expect(PA.booted.cfg).toBe(cfg);
    for (const k of ["init", "update", "draw", "onDown", "qa"])
      expect(typeof game[k]).toBe("function");
  });

  it("starts waiting with five pieces stacked on screen and no progress", () => {
    const s = game.qa();
    expect(s).toMatchObject({
      phase: "wait",
      t: 0,
      score: 0,
      goal: 40,
      result: null,
      scale: 1,
      progress: 0,
    });
    expect(s.pieces).toEqual(
      [470, 630, 790, 950, 1110].map((y) => ({ x: 360, y })),
    );
    expect(PA.calls.resetEndCard).toBe(1);
  });

  it("holds the gameplay clock and the pieces until the first touch", () => {
    const before = game.qa().pieces;
    step(5);
    const s = game.qa();
    expect(s.t).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.pieces).toEqual(before);
    expect(drawnPieces()).toHaveLength(5);
    expect(names()).toEqual([]);
  });

  it("keeps the waiting screen alive: pieces bob and the target glows", () => {
    step(0.2);
    const a = drawnPieces();
    step(0.3);
    const b = drawnPieces();
    expect(a.map((p) => p.y)).not.toEqual(b.map((p) => p.y));
    const { log } = frame();
    const arcs = log.filter((c) => c.k === "arc");
    expect(arcs).toHaveLength(1);
    expect(arcs[0].a[0]).toBe(360);
    // the glow sits on the highest piece, give or take its 10 px bob
    expect(Math.abs(arcs[0].a[1] - 470)).toBeLessThanOrEqual(10);
  });

  it("pops the hook in and loops the hand on the highest on-screen piece", () => {
    let hud = frame().hud;
    expect(hud.some((c) => c.k === "text" && c.a[1] === "POP 40 IN 40S!")).toBe(
      false,
    );
    step(0.6);
    hud = frame().hud;
    expect(hud.some((c) => c.k === "text" && c.a[1] === "POP 40 IN 40S!")).toBe(
      true,
    );
    const hands = hud.filter((c) => c.k === "hintHand");
    expect(hands).toHaveLength(1);
    expect(hands[0].a[1]).toEqual({ x: 360, y: 470 });
    expect(hands[0].a[3]).toMatchObject({ urgent: false });
  });

  it("covers the view with the background, centered", () => {
    const first = frame().log.find((c) => c.k === "drawImage");
    expect(first?.a).toEqual([PA.img.bg, -280, 0, 1280, 1280]);
  });

  it("draws a star piece with its own image and aspect ratio", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    await load();
    const stars = frame().log.filter(
      (c) => c.k === "drawImage" && c.a[0] === PA.img.star,
    );
    expect(stars).toHaveLength(5);
    for (const c of stars) expect(c.a[4]).toBeCloseTo(c.a[3] * 2, 9);
  });
});

describe("first touch and popping", () => {
  it("starts the round on the first touch, even off every piece", () => {
    tap(6, 576);
    const s = game.qa();
    expect(s.phase).toBe("play");
    expect(s.score).toBe(0);
    expect(names()).toEqual(["play"]);
    // a started round reports pieces where they will be a beat later
    expect(s.pieces[0]).toEqual({ x: 360, y: 470 - 205 * 0.03 });
  });

  it("pops a piece hit at the first touch and scores it", () => {
    tap(360, 630);
    const s = game.qa();
    expect(s.score).toBe(1);
    expect(s.pieces.map((p: any) => p.y)).not.toContain(630 - 205 * 0.03);
    expect(s.pieces).toHaveLength(4);
    expect(names()).toEqual(["play", "pop"]);
    expect(event("pop").data).toEqual({ score: 1 });
    expect(PA.sounds[0][0]).toBe("pop");
    expect(PA.fxs[1].texts[0]).toMatchObject({ x: 360, y: 590, s: "+1" });
    expect(PA.fxs[0].bursts[0]).toMatchObject({ x: 360, y: 630 });
  });

  it("hits within the piece radius plus 24 px, and not beyond", () => {
    tap(360 + 91, 470);
    expect(game.qa().score).toBe(0);
    tap(360 + 89, 470);
    expect(game.qa().score).toBe(1);
  });

  it("pops the nearest of two pieces in reach", () => {
    tap(360, 545); // 75 px from the piece at 470, 85 px from the one at 630
    const ys = game.qa().pieces.map((p: any) => p.y + 205 * 0.03);
    expect(ys[0]).toBeCloseTo(630, 9);
    expect(ys).toHaveLength(4);
  });

  it("runs the clock, raises the pieces and spawns below the screen", () => {
    tap(6, 576);
    step(STEP);
    const spawned = drawnPieces();
    expect(spawned).toHaveLength(6);
    expect(spawned[5].y).toBeCloseTo(1280 + 80 - 205 * STEP, 6);
    step(1 - STEP);
    const s = game.qa();
    expect(s.t).toBeCloseTo(1, 6);
    expect(s.progress).toBe(1);
    const pieces = drawnPieces();
    expect(pieces[0].y).toBeCloseTo(470 - 205, 3);
    // one spawn at once, then every 0.9 s: the second one has risen for about 0.1 s
    expect(pieces).toHaveLength(7);
    expect(Math.abs(pieces[6].y - (1280 + 80 - 205 * 0.1))).toBeLessThan(
      205 * STEP + 0.5,
    );
  });

  it("drops pieces that float above the play area", () => {
    tap(6, 576);
    step(1.7);
    const ys = drawnPieces().map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(140);
    expect(ys.some((y) => Math.abs(y - 630 + 205 * 1.7) < 1)).toBe(true);
    expect(ys.some((y) => Math.abs(y - 470 + 205 * 1.7) < 1)).toBe(false);
  });

  it("fades the hook out and the HUD in after the first touch", () => {
    step(0.6);
    tap(6, 576);
    step(0.4);
    const { log, hud } = frame();
    expect(hud.some((c) => c.k === "text" && c.a[1] === "POP 40 IN 40S!")).toBe(
      false,
    );
    expect(log.find((c) => c.k === "=globalAlpha")?.a[0]).toBe(1);
    expect(log.filter((c) => c.k === "arc")).toHaveLength(0);
    expect(hud.find((c) => c.k === "ctaPill")?.a.slice(1)).toEqual([
      524, 44, 172, 56,
    ]);
  });

  it("shows the score and the remaining seconds, red in the last five", () => {
    tap(360, 470);
    let texts = frame().hud.filter((c) => c.k === "text");
    expect(texts.map((c) => c.a[1])).toEqual(
      expect.arrayContaining(["1 / 40", "0:40"]),
    );
    step(34.5);
    texts = frame().hud.filter((c) => c.k === "text");
    expect(texts.find((c) => c.a[1] === "0:06")?.a[4]).toMatchObject({
      color: "#fff",
    });
    step(1);
    texts = frame().hud.filter((c) => c.k === "text");
    const clock = texts.find((c) => c.a[1] === "0:05");
    expect(clock?.a[4]).toMatchObject({ color: "#ff8ac8" });
  });

  it("brings the hand back only on the idle hint, urgent near the top", () => {
    tap(6, 576);
    step(0.1);
    expect(frame().hud.filter((c) => c.k === "hintHand")).toHaveLength(0);
    PA.idleState.hint = true;
    let hand = frame().hud.find((c) => c.k === "hintHand");
    expect(hand?.a[3]).toMatchObject({ urgent: false });
    step(0.2); // the target, the piece from 470, rises just past 420
    hand = frame().hud.find((c) => c.k === "hintHand");
    expect(hand?.a[1].y).toBeLessThan(420);
    expect(hand?.a[1].y).toBeGreaterThan(400);
    expect(hand?.a[3]).toMatchObject({ urgent: true });
  });
});

describe("payoff", () => {
  function popTo(score: number) {
    while (game.qa().score < score) popOne();
  }

  it("pops everything on screen at the tenth pop, once", () => {
    popTo(9);
    expect(event("payoff")).toBeUndefined();
    waitForPiece();
    const onScreen = drawnPieces().length;
    popOne();
    const p = event("payoff");
    expect(p.data.popped).toBe(onScreen - 1);
    expect(p.data.score).toBe(10 + p.data.popped);
    expect(game.qa().score).toBe(p.data.score);
    expect(PA.calls.shake).toEqual([[14, 0.5]]);
    expect(PA.ducks).toEqual([[0.12, 1.4]]);
    expect(PA.sounds.at(-1)).toEqual(["payoff", 1]);
    const banner = frame().hud.find((c) => c.k === "banner");
    expect(banner?.a.slice(1, 3)).toEqual(["MEGA POP!", "+" + p.data.popped]);
    expect(banner?.a[3]).toMatchObject({ color: "#ffd23a" });

    PA.runTimers(0.06 * p.data.popped + 0.05);
    expect(drawnPieces()).toHaveLength(0);
    expect(PA.fxs[0].bursts.filter((b: any) => b.o.n === 22)).toHaveLength(
      p.data.popped,
    );

    popOne();
    expect(PA.events.filter((e: any) => e.name === "payoff")).toHaveLength(1);
  });

  it("skips the burst for a piece the player popped first", () => {
    popTo(10);
    const popped = event("payoff").data.popped;
    const last = drawnPieces().reduce((a, b) => (b.y > a.y ? b : a));
    tap(last.x, last.y);
    PA.runTimers(0.06 * popped + 0.05);
    expect(PA.fxs[0].bursts.filter((b: any) => b.o.n === 22)).toHaveLength(
      popped - 1,
    );
  });

  it("clears the payoff banner after 1.4 s", () => {
    popTo(10);
    step(1.3);
    expect(frame().hud.some((c) => c.k === "banner")).toBe(true);
    step(0.2);
    expect(frame().hud.some((c) => c.k === "banner")).toBe(false);
  });

  it("keeps a result banner that replaced the payoff one", () => {
    popTo(10);
    step(0.5);
    PA.idleState.timeout = true;
    step(STEP);
    // past the payoff banner's 1.4 s timer, inside the idle line's own 1.4 s
    PA.runTimers(1);
    expect(game.qa().phase).toBe("result");
    const banner = frame().hud.find((c) => c.k === "banner");
    expect(banner?.a[1]).toBe("TIME OUT!");
  });
});

describe("endings", () => {
  it("sends an untouched viewer to the end card with the promise", () => {
    step(1);
    PA.idleState.timeout = true;
    step(STEP);
    expect(game.qa()).toMatchObject({ phase: "end", result: null });
    expect(names()).toEqual(["endcard"]);
    expect(event("endcard").data).toEqual({ result: null });
    const card = frame().hud.find((c) => c.k === "drawEndCard")?.a[1];
    expect(card).toMatchObject({
      title: "CAN YOU POP 40?",
      tagline: "Tap to pop them all",
      titleColor: "#ff8ac8",
      stats: [
        { label: "POPPED", value: "0" },
        { label: "GOAL", value: "40" },
      ],
    });
  });

  it("ends a started round idle for 10 s with a short honest line", () => {
    tap(360, 470);
    PA.idleState.timeout = true;
    step(STEP);
    expect(game.qa()).toMatchObject({ phase: "result", result: "close" });
    expect(event("result").data).toEqual({
      result: "close",
      score: 1,
      goal: 40,
      why: "idle",
    });
    expect(PA.sounds.at(-1)).toEqual(["fail", 1]);
    expect(PA.ducks.at(-1)).toEqual([0.15, 2.5]);
    const banner = frame().hud.find((c) => c.k === "banner");
    expect(banner?.a.slice(1, 3)).toEqual(["TIME OUT!", "39 to go!"]);
    expect(banner?.a[3]).toMatchObject({ color: "#ff8ac8" });
    PA.runTimers(1.3);
    expect(game.qa().phase).toBe("result");
    PA.runTimers(0.15);
    expect(game.qa().phase).toBe("end");
    expect(event("endcard").data).toEqual({ result: "close" });
  });

  it("ends at the round timer, 40 s after the first touch", () => {
    tap(6, 576);
    step(39.9);
    expect(game.qa().phase).toBe("play");
    step(0.15);
    expect(game.qa().phase).toBe("result");
    expect(event("result").data).toMatchObject({ why: "time", score: 0 });
    const banner = frame().hud.find((c) => c.k === "banner");
    expect(banner?.a.slice(1, 3)).toEqual(["NICE TRY!", "40 to go!"]);
    PA.runTimers(2.9);
    expect(game.qa().phase).toBe("result");
    PA.runTimers(0.15);
    expect(game.qa().phase).toBe("end");
    const card = frame().hud.find((c) => c.k === "drawEndCard")?.a[1];
    expect(card).toMatchObject({ title: "NICE TRY!", tagline: "40 to go!" });
  });

  it("says SO CLOSE when ten or fewer pops are missing", () => {
    while (game.qa().score < 30) popOne();
    const score = game.qa().score;
    expect(score).toBeLessThan(40);
    stepUntil("result");
    expect(event("result").data).toMatchObject({
      result: "close",
      why: "time",
    });
    const banner = frame().hud.find((c) => c.k === "banner");
    expect(banner?.a.slice(1, 3)).toEqual([
      "SO CLOSE!",
      40 - score + " to go!",
    ]);
  });

  it("wins with the goal reached, a win sound and four confetti bursts", () => {
    while (game.qa().score < 40) popOne();
    stepUntil("result");
    const s = game.qa();
    expect(s.result).toBe("win");
    expect(event("result").data).toMatchObject({ result: "win", goal: 40 });
    expect(PA.sounds.at(-1)).toEqual(["win", 1]);
    const banner = frame().hud.find((c) => c.k === "banner");
    expect(banner?.a.slice(1, 3)).toEqual([
      "GOAL REACHED!",
      s.score + " popped",
    ]);
    expect(banner?.a[3]).toMatchObject({ color: "#ffd23a" });
    PA.runTimers(0.8);
    const confetti = PA.fxs[0].bursts.filter((b: any) => b.o.n === 40);
    expect(confetti).toHaveLength(4);
    for (const b of confetti) expect([b.x, b.y]).toEqual([360, 300]);
    PA.runTimers(2.3);
    const card = frame().hud.find((c) => c.k === "drawEndCard")?.a[1];
    expect(card).toMatchObject({
      title: "GOAL REACHED!",
      titleColor: "#ffd23a",
      stats: [
        { label: "POPPED", value: String(s.score) },
        { label: "GOAL", value: "40" },
      ],
    });
  });

  it("ends the round as soon as the goal is reached", () => {
    while (game.qa().score < 40) popOne();
    step(STEP);
    expect(game.qa().phase).toBe("result");
  });

  // qa.py's active_length check wants the good bot's end card at 33 to 52 s; the end card follows
  // the result by 3 s, so a goal reached too early fails the template's own QA run
  it("paces the goal so a player who pops every piece wins late in the round", () => {
    tap(6, 576);
    let last = 0;
    while (game.qa().phase === "play") {
      const s = game.qa();
      if (s.t - last >= 0.3 && s.pieces.length) {
        last = s.t;
        const p = s.pieces.reduce((a: any, b: any) => (b.y < a.y ? b : a));
        tap(p.x, p.y);
      }
      step(0.04);
    }
    expect(event("result").data).toMatchObject({ result: "win", why: "goal" });
    expect(game.qa().t).toBeGreaterThan(30);
    expect(game.qa().t).toBeLessThan(36);
  });

  it("ignores taps and freezes play once the round is over", () => {
    tap(6, 576);
    PA.idleState.timeout = true;
    step(STEP);
    const before = game.qa();
    const events = PA.events.length;
    tap(360, before.pieces[0].y);
    step(1);
    expect(game.qa()).toEqual(before);
    expect(PA.events).toHaveLength(events);
    PA.runTimers(1.5);
    tap(360, 470);
    step(1);
    expect(game.qa().phase).toBe("end");
    expect(game.qa().score).toBe(0);
  });

  it("replays from the end card into a fresh waiting round", () => {
    tap(360, 470);
    PA.idleState.timeout = true;
    step(STEP);
    PA.runTimers(1.5);
    const card = frame().hud.find((c) => c.k === "drawEndCard")?.a[1];
    PA.idleState.timeout = false;
    card.replay();
    expect(names().at(-1)).toBe("replay");
    expect(PA.calls.clearTweens).toBe(1);
    expect(PA.calls.resetEndCard).toBe(2);
    expect(game.qa()).toMatchObject({
      phase: "wait",
      score: 0,
      t: 0,
      result: null,
    });
    expect(game.qa().pieces).toHaveLength(5);
  });
});

describe("qa snapshot", () => {
  it("reports tap targets in client pixels for the current scale", () => {
    PA.view.s = 0.5;
    PA.view.gx = 20;
    PA.view.gy = 4;
    const s = game.qa();
    expect(s.scale).toBe(0.5);
    expect(s.pieces[0]).toEqual({ x: 200, y: 239 });
    expect(s.empty).toEqual({ x: 23, y: 4 + 1280 * 0.45 * 0.5 });
    expect(s.cta).toEqual({ x: 200, y: 4 + (1280 * 0.76 + 58) * 0.5 });
  });

  it("lists only pieces inside the playable band", () => {
    tap(6, 576);
    step(1.2);
    // drawn: the first piece at 224 (above the band), one spawn below 1160; qa adds 0.03 s of rise
    const drawn = drawnPieces().map((p) => p.y);
    expect(drawn.some((y) => Math.abs(y - 224) < 1)).toBe(true);
    expect(drawn.filter((y) => y > 1160)).toHaveLength(1);
    const ys = game.qa().pieces.map((p: any) => p.y + 205 * 0.03);
    const want = [384, 544, 704, 864, 1114];
    expect(ys).toHaveLength(want.length);
    want.forEach((y, i) => expect(ys[i]).toBeCloseTo(y, 3));
  });

  it("grows progress with play time and score", () => {
    tap(360, 470);
    step(2);
    expect(game.qa().progress).toBe(3);
  });
});
