import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boot,
  loadRuntime,
  makeGame,
  recorder,
  STORE,
  restoreGlobals,
} from "./runtime-harness";

afterEach(() => {
  restoreGlobals();
  vi.restoreAllMocks();
});

async function booted(cfg: Record<string, unknown> = {}, game = makeGame()) {
  const env = await loadRuntime();
  await boot(env, cfg, game);
  return env;
}

describe("particles", () => {
  it("spawns a burst from its options and integrates drag and gravity", async () => {
    const { PA } = await booted();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fx = PA.makeFx();
    fx.burst(100, 200, {
      n: 5,
      speed: 200,
      lift: 50,
      gravity: 100,
      life: 1,
      size: 10,
      colors: ["#a", "#b"],
      shape: "circle",
      drag: 2,
      additive: true,
    });
    expect(fx.parts).toHaveLength(5);
    const p = fx.parts[0];
    // random 0.5: angle pi, speed 200 * 0.725, life and size at their base values
    expect(p.vx).toBeCloseTo(-145, 9);
    expect(p.vy).toBeCloseTo(-50, 9);
    expect(p).toMatchObject({
      life: 1,
      size: 10,
      color: "#b",
      shape: "circle",
      add: true,
    });
    fx.update(0.1);
    const k = Math.exp(-0.2);
    expect(p.vx).toBeCloseTo(-145 * k, 9);
    expect(p.vy).toBeCloseTo(-50 * k + 10, 6);
    expect(p.x).toBeCloseTo(100 - 14.5 * k, 9);
    expect(p.y).toBeCloseTo(200 + (-50 * k + 10) * 0.1, 6);
    fx.update(0.95);
    expect(fx.parts).toHaveLength(0);
  });

  it("uses white rects by default and caps the pool at 900", async () => {
    const { PA } = await booted();
    const fx = PA.makeFx();
    fx.burst(0, 0);
    expect(fx.parts).toHaveLength(12);
    expect(fx.parts[0]).toMatchObject({
      color: "#fff",
      shape: "rect",
      g: 0,
      drag: 2.5,
    });
    fx.burst(0, 0, { n: 2000 });
    expect(fx.parts).toHaveLength(900);
  });

  it("keeps at most 60 floating texts and expires them after their life", async () => {
    const { PA } = await booted();
    const fx = PA.makeFx();
    for (let i = 0; i < 61; i++) fx.text(0, 0, "t" + i);
    expect(fx.texts).toHaveLength(60);
    expect(fx.texts[0].str).toBe("t1");
    expect(fx.texts[0]).toMatchObject({ life: 0.7, size: 30, rise: 70 });
    fx.update(0.71);
    expect(fx.texts).toHaveLength(0);
  });

  it("draws each shape and the floating texts", async () => {
    const { PA } = await booted();
    const fx = PA.makeFx();
    fx.burst(0, 0, { n: 1, shape: "circle", additive: true });
    fx.burst(0, 0, { n: 1, shape: "spark" });
    fx.burst(0, 0, { n: 1 });
    fx.text(50, 60, "+10", { color: "#0f0", size: 40, life: 1, rise: 10 });
    const r = recorder();
    fx.draw(r.ctx);
    expect(r.of("arc")).toHaveLength(1);
    expect(r.of("closePath")).toHaveLength(1);
    expect(r.of("lineTo")).toHaveLength(7);
    expect(r.of("fillRect")).toHaveLength(1);
    expect(r.of("globalCompositeOperation=").map((a) => a[0])).toEqual([
      "lighter",
      "source-over",
      "source-over",
      "source-over",
    ]);
    expect(r.of("fillText")[0][0]).toBe("+10");
    expect(r.of("globalAlpha=").at(-1)).toEqual([1]);
  });
});

describe("text and shapes", () => {
  it("builds the bold font from cfg.font with a sans-serif fallback", async () => {
    const env = await booted({ font: "Lilita" });
    expect(env.PA.draw.font(32.6)).toBe("700 33px Lilita, sans-serif");
    env.PA.cfg.font = undefined;
    expect(env.PA.draw.font(20)).toBe("700 20px sans-serif, sans-serif");
  });

  it("clamps the corner radius of a rounded rect to half the short side", async () => {
    const { PA } = await booted();
    const r = recorder();
    PA.draw.rrect(r.ctx, 0, 0, 40, 20, 50);
    expect(r.of("moveTo")[0]).toEqual([10, 0]);
    expect(r.of("arcTo").map((a) => a[4])).toEqual([10, 10, 10, 10]);
  });

  it("outlines text with the ink color unless stroke is false", async () => {
    const { PA } = await booted({ ink: "#222" });
    const r = recorder();
    PA.draw.text(r.ctx, "Hi", 1, 2);
    expect(r.of("strokeText")).toEqual([["Hi", 1, 2]]);
    expect(r.of("strokeStyle=")).toEqual([["#222"]]);
    expect(r.of("lineWidth=")).toEqual([[32 * 0.18]]);
    const r2 = recorder();
    PA.draw.text(r2.ctx, "Lo", 1, 2, {
      stroke: false,
      color: "#f00",
      align: "left",
    });
    expect(r2.of("strokeText")).toEqual([]);
    expect(r2.of("fillStyle=")).toEqual([["#f00"]]);
    expect(r2.of("textAlign=")).toEqual([["left"]]);
  });

  it("registers a button hit area only when it has an action", async () => {
    const fn = vi.fn();
    const env = await loadRuntime();
    const game = await boot(
      env,
      {},
      makeGame({
        draw: (c: unknown) => {
          env.PA.draw.button(c, 100, 100, 200, 80, "GO", fn);
          env.PA.draw.button(c, 100, 400, 200, 80, "NOPE");
        },
      }),
    );
    env.frame(16);
    env.tap(100, 70); // logical 200,140
    expect(fn).toHaveBeenCalledTimes(1);
    env.tap(100, 220); // logical 200,440: the label-only button
    expect(game.onDown).toHaveBeenCalledWith(200, 440);
  });

  it("draws a result banner with an optional subtitle", async () => {
    const { PA } = await booted();
    const r = recorder();
    PA.draw.banner(r.ctx, "WIN", "great", { plate: "#123", y: 500 });
    expect(r.of("fillText").map((a) => a.slice(0, 3))).toEqual([
      ["WIN", 360, 500 - 95 + 70],
      ["great", 360, 500 - 95 + 140],
    ]);
    expect(r.of("fillStyle=")).toContainEqual(["#123"]);
    const r2 = recorder();
    PA.draw.banner(r2.ctx, "LOSE");
    expect(r2.of("fillText")).toEqual([["LOSE", 360, 1280 * 0.2]]);
  });
});

describe("hint hand", () => {
  const first = (r: ReturnType<typeof recorder>) => r.of("translate")[0];

  it("bobs above a tap target, then presses with a ring", async () => {
    const { PA } = await booted();
    PA.realTime = 0.35; // p = 0.25: lifted
    const up = recorder();
    PA.draw.hintHand(up.ctx, { x: 100, y: 200 });
    expect(first(up)).toEqual([100, 200 - Math.sin(0.25 * Math.PI) * 16]);
    expect(up.of("arc")).toEqual([]);
    PA.realTime = 0.98; // p = 0.7: pressed
    const down = recorder();
    PA.draw.hintHand(down.ctx, { x: 100, y: 200 });
    expect(first(down)).toEqual([100, 200]);
    expect(down.of("arc")).toEqual([[100, 200, 24, 0, 7]]);
  });

  it("travels from the drag start to the target along a dashed guide", async () => {
    const { PA } = await booted();
    const from = { x: 0, y: 0 },
      to = { x: 100, y: 50 };
    const at = (time: number) => {
      PA.realTime = time;
      const r = recorder();
      PA.draw.hintHand(r.ctx, from, to);
      return r;
    };
    const start = at(0.1 * 1.4);
    expect(start.of("setLineDash")).toEqual([[[14, 12]]]);
    expect(start.of("lineTo")).toContainEqual([100, 50]);
    expect(first(start)).toEqual([0, 0]);
    const mid = first(at(0.475 * 1.4)); // halfway through the travel
    expect(mid[0]).toBeCloseTo(50, 6);
    expect(mid[1]).toBeCloseTo(25, 6);
    expect(first(at(0.9 * 1.4))).toEqual([100, 50]);
  });

  it("adds an expanding ring and a bigger hand when urgent", async () => {
    const { PA } = await booted();
    PA.realTime = 0.1;
    const r = recorder();
    PA.draw.hintHand(r.ctx, { x: 10, y: 20 }, null, {
      urgent: true,
      ringColor: "#0ff",
    });
    const ring = r.of("arc")[0];
    expect(ring.slice(0, 2)).toEqual([10, 20]);
    expect(ring[2]).toBeCloseTo(26 + 0.22 * 46, 9);
    expect(r.of("strokeStyle=")[0]).toEqual(["#0ff"]);
    expect(r.of("scale")[0]).toEqual([1.15, 1.15]);
  });

  it("draws the hand image with its fingertip on the target when one is loaded", async () => {
    const { PA } = await booted();
    PA.img.__hand = { width: 100, height: 200 };
    PA.realTime = 0;
    const r = recorder();
    PA.draw.hand(r.ctx, 30, 40);
    const [im, x, y, w, h] = r.of("drawImage")[0];
    expect(im).toBe(PA.img.__hand);
    expect([w, h]).toEqual([59, 118]);
    expect(x).toBeCloseTo(-59 * 0.276, 9);
    expect(y).toBeCloseTo(-118 * 0.007, 9);
    const vector = recorder();
    PA.img.__hand = undefined;
    PA.draw.hand(vector.ctx, 30, 40);
    expect(vector.of("drawImage")).toEqual([]);
    expect(vector.of("arcTo")).toHaveLength(8); // two rounded rects
  });
});

describe("end card", () => {
  async function card(
    o: Record<string, unknown>,
    cfg: Record<string, unknown> = {},
  ) {
    const env = await loadRuntime();
    await boot(
      env,
      { images: { logo: "img:1000x1000", hero: "img:200x100" }, ...cfg },
      makeGame({ draw: (c: unknown) => env.PA.drawEndCard(c, o) }),
    );
    env.frame(16);
    return env;
  }

  it("scales the logo under logoMaxH and draws the hero in its slot", async () => {
    const env = await card({ logo: "logo", hero: "hero" });
    const logo = env.rec.of("drawImage").find((a) => a[0] === env.PA.img.logo)!;
    // 480 wide by default, but 0.2 of the height (256) caps a square logo
    expect(logo.slice(3)).toEqual([256, 256]);
    expect(logo[1]).toBe(360 - 128);
    const hero = env.rec.of("drawImage").find((a) => a[0] === env.PA.img.hero)!;
    expect(hero[1]).toBe(360 - 250);
    expect(hero.slice(3)).toEqual([500, 250]);
    const env2 = await card({ logo: "logo", logoMaxH: 100 });
    const small = env2.rec
      .of("drawImage")
      .find((a) => a[0] === env2.PA.img.logo)!;
    expect(small.slice(3)).toEqual([100, 100]);
  });

  it("hands the hero slot to art(), smaller with a tagline", async () => {
    const art = vi.fn();
    await card({ art, tagline: "Tap" });
    expect(art.mock.calls[0][1]).toEqual({
      x: 160,
      y: 1280 * 0.44,
      w: 400,
      h: 220,
    });
    const art2 = vi.fn();
    await card({ art: art2, heroH: 150 });
    expect(art2.mock.calls[0][1]).toEqual({
      x: 160,
      y: 1280 * 0.41,
      w: 400,
      h: 150,
    });
  });

  it("writes the title, tagline and one column per stat", async () => {
    const env = await card({
      title: "WIN",
      tagline: "Tap",
      stats: [
        { label: "SCORE", value: "9" },
        { label: "GOAL", value: "10" },
      ],
    });
    const texts = env.rec.of("fillText").map((a) => a.slice(0, 2));
    expect(texts).toEqual(
      expect.arrayContaining([
        ["WIN", 360],
        ["Tap", 360],
        ["9", 60 + 150],
        ["SCORE", 60 + 150],
        ["10", 60 + 450],
        ["PLAY FREE", 210],
      ]),
    );
  });

  it("sends taps on the art and the button to the store, and Replay to the game", async () => {
    const replay = vi.fn();
    const env = await card({ replay }, { ctaLabel: "INSTALL" });
    expect(env.rec.of("fillText").map((a) => a[0])).toContain("INSTALL");
    expect(env.PA.replayRect).toEqual({ x: 180, y: 576 });
    env.tap(180, 576);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(env.win.open).not.toHaveBeenCalled();
    env.tap(180, 100); // logo area
    env.tap(180, (1280 * 0.76 + 58) / 2); // the CTA button
    expect(env.win.open).toHaveBeenCalledTimes(2);
    expect(env.win.open).toHaveBeenCalledWith(STORE.android, "_blank");
  });

  it("restarts its animation clock on resetEndCard", async () => {
    const env = await card({ logo: "logo" });
    env.frame(16);
    env.PA.resetEndCard();
    env.rec.calls.length = 0;
    env.frame(16);
    const logo = env.rec.of("drawImage").find((a) => a[0] === env.PA.img.logo)!;
    expect(logo[2]).toBeCloseTo(1280 * 0.05 + Math.sin(2 / 60) * 6, 9);
  });
});
