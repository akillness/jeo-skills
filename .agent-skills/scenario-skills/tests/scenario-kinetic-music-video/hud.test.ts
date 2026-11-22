import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeCtx, restoreGlobals, setGlobal, type Draw } from "./engine-fakes";

// hud.js draws on a 2D canvas and blits it through three: the canvas is a recording
// fake and three a stand-in, while the layout, counters and subtitle timing run for real.
vi.mock("three", async () => (await import("./engine-fakes")).three);
vi.mock("three/addons/loaders/TTFLoader.js", () => ({ TTFLoader: class {} }));
vi.mock("three/addons/loaders/FontLoader.js", () => ({ Font: class {} }));
vi.mock("three/addons/geometries/TextGeometry.js", () => ({
  TextGeometry: class {},
}));

const ENGINE = "../../skills/scenario-kinetic-music-video/assets/engine";
const { PAL, makeTimeline } = await import(`${ENGINE}/core.js`);

const AUDIO = {
  bpm: 120,
  env_fps: 60,
  env: {},
  beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  downbeats: [0, 2],
};
const LINE = {
  s: 1,
  e: 2,
  section: "v1",
  words: [{ w: "hello", s: 1, e: 1.4 }],
};
const LANDSCAPE = { x: 0, y: 0, w: 1920, h: 1080 };
const PORTRAIT = { x: 65, y: 269, w: 875, h: 979 };

type Hud = {
  load: (E: Record<string, any>) => Promise<void>;
  render: (E: Record<string, any>, t: number, rt: unknown) => unknown;
};

async function loadHud(cfg: Record<string, unknown> = {}) {
  vi.resetModules();
  // Unresolvable from this folder too, so vitest keys the mock by the raw
  // specifier hud.js itself imports.
  vi.doMock("../timeline.js", () => ({ HUD: cfg }));
  return (await import(`${ENGINE}/scenes/hud.js`)).default as Hud;
}

async function frame(
  cfg: Record<string, unknown>,
  t: number,
  over: Record<string, any> = {},
) {
  const hud = await loadHud(cfg);
  const ctx = fakeCtx();
  const out: {
    karaoke: Record<string, any>[];
    blits: number[];
    targets: unknown[];
    surface: number[];
    commits: number;
  } = { karaoke: [], blits: [], targets: [], surface: [], commits: 0 };
  const E: Record<string, any> = {
    W: 1920,
    H: 1080,
    SCALE: 1,
    ORIENT: "landscape",
    SAFE: LANDSCAPE,
    debugSafe: false,
    dur: 100,
    ...makeTimeline(AUDIO, { lines: [LINE] }),
    makeG2D: (w: number, h: number) => {
      out.surface = [w, h];
      return { ctx, clear() {}, commit: () => out.commits++ };
    },
    drawKaraoke: (c: any, _E: unknown, ln: unknown, tt: number, o: any) =>
      out.karaoke.push({
        ln,
        t: tt,
        o,
        alpha: c.globalAlpha,
        bar: c.fillStyle,
      }),
    renderer: { setRenderTarget: (rt: unknown) => out.targets.push(rt) },
    blitG2D: (_E: unknown, _g: unknown, k: number) => out.blits.push(k),
    ...over,
  };
  E.hud = { alpha: 1, label: "", sub: true, corners: true, ...over.hud };
  await hud.load(E);
  const ret = hud.render(E, t, "rt");
  return { ...out, ret, draws: ctx.draws, E };
}

const texts = (draws: Draw[]) =>
  draws.filter((d) => d.op === "fillText").map((d) => d.args[0]);
const textAt = (draws: Draw[], s: string) =>
  draws.find((d) => d.op === "fillText" && d.args[0] === s);

afterEach(() => {
  restoreGlobals();
});

describe("corners", () => {
  const CFG = {
    title: "NIGHT DRIVE",
    sections: [
      [0, "INTRO"],
      [2, "HOOK"],
    ],
  };

  it("labels the title, the current section and the bar", async () => {
    const { draws } = await frame(CFG, 2.6);
    expect(texts(draws)).toEqual(["NIGHT DRIVE", "02 HOOK", "BAR 02/2"]);
    expect(textAt(draws, "NIGHT DRIVE")).toMatchObject({
      args: ["NIGHT DRIVE", 52, 52],
      align: "left",
      fill: PAL.white,
    });
    expect(textAt(draws, "02 HOOK")).toMatchObject({
      args: ["02 HOOK", 1868, 52],
      align: "right",
    });
  });

  it("switches to a section exactly at its start and keeps the latest one reached", async () => {
    const cfg = {
      sections: [
        [0, "A"],
        [2, "B"],
        [4, "C"],
      ],
    };
    const at = async (t: number) => texts((await frame(cfg, t)).draws)[1];
    expect(await at(1.99)).toBe("01 A");
    expect(await at(2)).toBe("02 B");
    expect(await at(5)).toBe("03 C");
  });

  it("lights the beat square of the current beat in the accent", async () => {
    const { draws } = await frame(CFG, 2.6);
    const squares = draws.filter(
      (d) => d.op === "fillRect" && d.args[1] === 69,
    );
    expect(squares.map((d) => [d.fill, d.alpha])).toEqual([
      [PAL.white, 0.25],
      [PAL.accent, 1],
      [PAL.white, 0.25],
      [PAL.white, 0.25],
    ]);
  });

  it("appends the scene's label and honors a fixed bar count", async () => {
    const { draws } = await frame({ ...CFG, bars: 16 }, 0.1, {
      hud: { label: "DROP" },
    });
    expect(texts(draws)).toContain("01 INTRO  ·  DROP");
    expect(texts(draws)).toContain("BAR 01/16");
  });

  it("draws a mark left of the title once per alpha and shifts the title past it", async () => {
    const paths: string[] = [];
    setGlobal(
      "Path2D",
      class {
        constructor(d: string) {
          paths.push(d);
        }
      },
    );
    const mark = { path: "M0 0L20 10Z", w: 20, h: 10, alphas: [1, 0.5] };
    const { draws } = await frame({ ...CFG, mark }, 0.1, {
      hud: { alpha: 0.8 },
    });
    expect(paths).toEqual(["M0 0L20 10Z"]);
    const fills = draws.filter((d) => d.op === "fill");
    expect(fills.map((d) => d.alpha)).toEqual([0.8, 0.4]);
    // 14 px tall mark: 20 * 1.4 wide, then a 10 px gap
    expect(textAt(draws, "NIGHT DRIVE")?.args[1]).toBe(52 + 28 + 10);
  });

  it("skips every corner element when the scene turns corners off", async () => {
    const { draws } = await frame(CFG, 2.6, { hud: { corners: false } });
    expect(texts(draws)).toEqual([]);
    expect(draws.filter((d) => d.op === "stroke")).toEqual([]);
  });

  it("anchors to the safe band on a tall canvas", async () => {
    const { draws } = await frame(CFG, 0.1, {
      W: 1080,
      H: 1920,
      ORIENT: "portrait",
      SAFE: PORTRAIT,
    });
    expect(textAt(draws, "NIGHT DRIVE")?.args.slice(1)).toEqual([
      65 + 52,
      269 + 52,
    ]);
    expect(textAt(draws, "01 INTRO")?.args[1]).toBe(65 + 875 - 52);
  });
});

describe("theme", () => {
  const inkOf = async (hud: Record<string, unknown>, cfg = {}) => {
    const { draws } = await frame({ title: "T", ...cfg }, 2.6, { hud });
    const squares = draws.filter(
      (d) => d.op === "fillRect" && d.args[1] === 69,
    );
    return [textAt(draws, "T")?.fill, squares[1].fill];
  };

  it("uses light ink on dark frames and dark ink on light ones", async () => {
    expect(await inkOf({})).toEqual([PAL.white, PAL.accent]);
    expect(await inkOf({ theme: "light" })).toEqual([PAL.ink, PAL.ink]);
  });

  it("lets the scene override the theme colors, and timeline.js set them", async () => {
    expect(await inkOf({ ink: "#111", accent: "#222" })).toEqual([
      "#111",
      "#222",
    ]);
    expect(
      await inkOf(
        { theme: "light" },
        { light: { ink: "#333", accent: "#444" } },
      ),
    ).toEqual(["#333", "#444"]);
  });
});

describe("counters", () => {
  const counterText = async (ct: Record<string, unknown>, t: number) => {
    const { draws } = await frame({ counters: [ct], progress: false }, t);
    return texts(draws).at(-1);
  };

  it.each([
    [
      "interpolates linearly",
      {
        keys: [
          [0, 0],
          [10, 20000],
        ],
      },
      5,
      "10,000",
    ],
    [
      "holds the first key before it",
      {
        keys: [
          [2, 7],
          [4, 9],
        ],
      },
      1,
      "7",
    ],
    [
      "holds the last key after it",
      {
        keys: [
          [2, 7],
          [4, 9],
        ],
      },
      9,
      "9",
    ],
    ["shows 0 without keys", { keys: [] }, 1, "0"],
    [
      "interpolates in log space",
      {
        keys: [
          [0, 1],
          [10, 10000],
        ],
        interp: "log",
      },
      5,
      "100",
    ],
    [
      "holds a finite value until an infinite key",
      {
        keys: [
          [0, 1],
          [10, Infinity],
        ],
      },
      5,
      "1",
    ],
    [
      "reaches infinity",
      {
        keys: [
          [0, 1],
          [10, Infinity],
        ],
      },
      10,
      "∞",
    ],
    ["caps huge values", { keys: [[0, 2e15]] }, 1, "∞"],
    [
      "reads minutes after midnight as a clock",
      { keys: [[0, 125.5]], fmt: "clock", suffix: " AM" },
      1,
      "02:05:30 AM",
    ],
    [
      "wraps the clock past midnight",
      { keys: [[0, 1500]], fmt: "clock" },
      1,
      "01:00:00",
    ],
    [
      "groups small sci values",
      { keys: [[0, 12345]], fmt: "sci" },
      1,
      "12,345",
    ],
    [
      "writes large sci values",
      { keys: [[0, 12345678]], fmt: "sci" },
      1,
      "1.23E7",
    ],
    [
      "keeps short values below 100k",
      { keys: [[0, 99999]], fmt: "short" },
      1,
      "99,999",
    ],
    ["shortens thousands", { keys: [[0, 150000]], fmt: "short" }, 1, "150.0K"],
    ["shortens millions", { keys: [[0, 1.5e6]], fmt: "short" }, 1, "1.50M"],
    ["shortens billions", { keys: [[0, 25e9]], fmt: "short" }, 1, "25.0B"],
    ["shortens trillions", { keys: [[0, 2e12]], fmt: "short" }, 1, "2.00T"],
    [
      "picks a text by value",
      { keys: [[0, 1.7]], fmt: "text", texts: ["ZERO", "ONE"] },
      1,
      "ONE",
    ],
    [
      "shows nothing past the texts",
      { keys: [[0, 5]], fmt: "text", texts: ["A"] },
      1,
      "",
    ],
    [
      "prefixes the label and appends the suffix",
      { label: "COUNT", keys: [[0, 3]], suffix: " PPL" },
      1,
      "COUNT 3 PPL",
    ],
  ])("%s", async (_name, ct, t, expected) => {
    expect(await counterText(ct, t)).toBe(expected);
  });

  it("stacks counters upwards from the bottom-right, the first one brightest", async () => {
    const { draws } = await frame(
      {
        counters: [
          { label: "A", keys: [[0, 1]] },
          { label: "B", keys: [[0, 2]] },
        ],
      },
      1,
    );
    const a = textAt(draws, "A 1")!,
      b = textAt(draws, "B 2")!;
    expect(a.args.slice(1)).toEqual([1868, 1028]);
    expect(b.args.slice(1)).toEqual([1868, 1008]);
    expect([a.alpha, b.alpha]).toEqual([0.9, 0.6]);
  });
});

describe("progress", () => {
  const bars = (draws: Draw[]) =>
    draws.filter((d) => d.op === "fillRect" && d.args[1] === 1028);

  it("fills the hairline with the song's progress", async () => {
    const { draws } = await frame({}, 25);
    expect(bars(draws).map((d) => [d.args[2], d.fill, d.alpha])).toEqual([
      [220, PAL.white, 0.25],
      [55, PAL.accent, 0.9],
    ]);
  });

  it("can be turned off in timeline.js", async () => {
    const { draws } = await frame({ progress: false }, 25);
    expect(bars(draws)).toEqual([]);
  });
});

describe("visibility", () => {
  it("draws nothing once the scene hides it", async () => {
    const r = await frame({}, 1.5, { hud: { alpha: 0 } });
    expect(r.ret).toBe(0);
    expect(r.draws).toEqual([]);
    expect(r.karaoke).toEqual([]);
    expect(r.blits).toEqual([]);
  });

  it("still outlines the safe band under --safe while hidden", async () => {
    const r = await frame({}, 1.5, {
      hud: { alpha: 0 },
      debugSafe: true,
      SAFE: PORTRAIT,
    });
    expect(r.draws.filter((d) => d.op === "strokeRect")).toMatchObject([
      { args: [65, 269, 875, 979], stroke: "#ff00ff" },
    ]);
    expect(r.blits).toEqual([1]);
  });

  it("draws on a full-frame surface and blits it into the layer's target", async () => {
    const r = await frame({}, 0.1);
    expect(r.surface).toEqual([1920, 1080]);
    expect(r.commits).toBe(1);
    expect(r.targets).toEqual(["rt"]);
    expect(r.blits).toEqual([1]);
  });

  it("opts out of motion blur, so its digits stay sharp", async () => {
    const hud = (await loadHud()) as Hud & { blur?: unknown };
    expect(hud.blur).toBe(false);
  });
});

describe("subtitles", () => {
  it("sets the sung line bottom-left of the safe band on landscape", async () => {
    const { karaoke } = await frame({}, 1.5);
    expect(karaoke).toHaveLength(1);
    expect(karaoke[0].ln).toBe(LINE);
    expect(karaoke[0].o).toMatchObject({
      x: 92,
      y: 1080 - 92,
      size: 24,
      litColor: PAL.white,
      maxW: undefined,
    });
    expect(karaoke[0].alpha).toBe(1);
    expect(karaoke[0].bar).toBe(PAL.accent);
  });

  it("fits the line to the band and lifts it above the counters off landscape", async () => {
    const counters = [1, 2].map((v) => ({ keys: [[0, v]] }));
    const { karaoke } = await frame({ counters }, 1.5, {
      W: 1080,
      H: 1920,
      ORIENT: "portrait",
      SAFE: PORTRAIT,
    });
    expect(karaoke[0].o).toMatchObject({
      x: 65 + 92,
      y: 269 + 979 - 101,
      maxW: 875 - 144,
    });
  });

  it("fades in from a quarter second before the line", async () => {
    const { karaoke } = await frame({}, 0.79);
    expect(karaoke[0].alpha).toBeCloseTo(0.5);
  });

  it.each([
    ["before the line", 0.7],
    ["half a second after it", 2.51],
  ])("shows nothing %s", async (_name, t) => {
    expect((await frame({}, t)).karaoke).toEqual([]);
  });

  it("dims the words with the scene's HUD alpha, not only the bar", async () => {
    const { karaoke } = await frame({}, 1.5, { hud: { alpha: 0.4 } });
    expect(karaoke[0].alpha).toBeCloseTo(0.4);
    expect(karaoke[0].o.alpha).toBeCloseTo(0.4);
  });

  it("leaves the line fade to drawKaraoke, so the words do not fade twice", async () => {
    const { karaoke } = await frame({}, 0.79);
    expect(karaoke[0].o.alpha).toBe(1);
  });

  it("stays off when the scene shows the lyric itself", async () => {
    expect((await frame({}, 1.5, { hud: { sub: false } })).karaoke).toEqual([]);
  });

  it("colors the subtitle bar from the theme", async () => {
    const { karaoke } = await frame({ dark: { sub: "#0f0" } }, 1.5);
    expect(karaoke[0].bar).toBe("#0f0");
  });
});
