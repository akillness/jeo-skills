import { describe, expect, it, vi } from "vitest";
import {
  FakeContext2D,
  fakeRenderer,
  NormalBlending,
  AdditiveBlending,
} from "./core-kit-fakes.ts";
import {
  blitG2D,
  drawKaraoke,
  drawStagger,
  drawSubtitle,
  drawText,
  fitSize,
  fontStr,
  LEAD,
  measure,
  popScale,
  stretchKW,
  wordAlpha,
} from "../../skills/scenario-kinetic-music-video/assets/engine/typekit.js";
import {
  makeTimeline,
  PAL,
  stretchKW as coreStretchKW,
} from "../../skills/scenario-kinetic-music-video/assets/engine/core.js";

// three and its addons are not installed; the stand-ins record what the engine hands them
vi.mock("three", () => import("./core-kit-fakes.ts"));
vi.mock(
  "three/addons/loaders/TTFLoader.js",
  () => import("./core-kit-fakes.ts"),
);
vi.mock(
  "three/addons/loaders/FontLoader.js",
  () => import("./core-kit-fakes.ts"),
);
vi.mock(
  "three/addons/geometries/TextGeometry.js",
  () => import("./core-kit-fakes.ts"),
);

const near = (v: number) => expect.closeTo(v, 6);
const fills = (ctx: FakeContext2D) => ctx.draws.filter((d) => d.op === "fill");

describe("stretchKW", () => {
  it("agrees with the core copy on every keyword boundary", () => {
    for (const v of [
      undefined,
      "normal",
      "condensed",
      "50%",
      "60%",
      "90%",
      "112.5%",
      "140%",
      "300%",
    ])
      expect(stretchKW(v)).toBe(coreStretchKW(v));
    expect(stretchKW("62.5%")).toBe("extra-condensed");
    expect(stretchKW("95%")).toBe("normal");
  });
});

describe("popScale", () => {
  it("holds the start value until LEAD before the onset", () => {
    expect(LEAD).toBe(0.05);
    expect(popScale(0.9, 1)).toBe(0);
    expect(popScale(0.9, 1, { from: 0.9 })).toBe(0.9);
  });

  it("overshoots once like the spring, then settles at 1", () => {
    const z = 0.38,
      wd = Math.sqrt(300) * Math.sqrt(1 - z * z);
    const peak = 1 + Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z));
    expect(popScale(1 - LEAD + Math.PI / wd, 1)).toBeCloseTo(peak, 3);
    expect(popScale(6, 1)).toBeCloseTo(1, 5);
    expect(popScale(6, 1, { from: 0.9 })).toBeCloseTo(1, 5);
  });

  it("dips below rest only during the anticipation window", () => {
    const at = (dt: number) => popScale(1 - LEAD + dt, 1, { from: 1 });
    expect(at(0.02)).toBeLessThan(1);
    expect(at(0.02)).toBeGreaterThan(0.94);
    expect(at(Math.PI / 40)).toBeCloseTo(1, 10);
    expect(at(0.5)).toBeCloseTo(1, 10);
    expect(popScale(1 - LEAD + 0.02, 1, { from: 1, antic: 0 })).toBe(1);
  });
});

describe("wordAlpha", () => {
  it("fades in over two frames from LEAD before the onset", () => {
    expect(wordAlpha(0.9, 1, 2)).toBe(0);
    expect(wordAlpha(1 - LEAD + 0.0175, 1, 2)).toBeCloseTo(0.5);
    expect(wordAlpha(1, 1, 2)).toBe(1);
  });

  it("fades out over `out` after the end, delayed by `hold`", () => {
    expect(wordAlpha(2.06, 1, 2)).toBeCloseTo(0.5);
    expect(wordAlpha(2.2, 1, 2)).toBe(0);
    expect(wordAlpha(2.1, 1, 2, { hold: 0.1 })).toBe(1);
    expect(wordAlpha(2.15, 1, 2, { hold: 0.1, out: 0.1 })).toBeCloseTo(0.5);
  });
});

describe("fontStr", () => {
  it("builds a CSS font shorthand with a rounded pixel size", () => {
    expect(fontStr()).toBe('900 120px "Archivo"');
    expect(
      fontStr({ font: "Inter", size: 63.6, weight: 400, italic: true }),
    ).toBe('italic 400 64px "Inter"');
  });
});

describe("drawText", () => {
  it("applies the transform, type settings and clamped alpha, then restores", () => {
    const ctx = new FakeContext2D();
    drawText(ctx, "HI", 100, 200, {
      rot: 0.5,
      skewX: 0.2,
      sx: 2,
      sy: 3,
      size: 100,
      font: "Inter",
      stretch: "125%",
      tracking: 0.1,
      alpha: 1.7,
      align: "left",
      baseline: "top",
    });
    const [d] = ctx.draws;
    expect(d).toMatchObject({
      op: "fill",
      text: "HI",
      x: 0,
      y: 0,
      tx: 100,
      ty: 200,
      rot: 0.5,
      skew: 0.2,
      sx: 2,
      sy: 3,
      font: '900 100px "Inter"',
      fontStretch: "expanded",
      letterSpacing: "10px",
      textAlign: "left",
      textBaseline: "top",
      globalAlpha: 1,
      fillStyle: PAL.white,
    });
    expect(ctx.stack).toEqual([]);
    expect([ctx.tx, ctx.ty, ctx.sx, ctx.font]).toEqual([
      0,
      0,
      1,
      "10px sans-serif",
    ]);
  });

  it("uses a uniform scale, centered defaults, and a floor of zero alpha", () => {
    const ctx = new FakeContext2D();
    drawText(ctx, "A", 0, 0, { s: 1.5, alpha: -0.5 });
    expect(ctx.draws[0]).toMatchObject({
      sx: 1.5,
      sy: 1.5,
      rot: 0,
      skew: 0,
      textAlign: "center",
      textBaseline: "middle",
      fontStretch: "normal",
      globalAlpha: 0,
    });
  });

  it("strokes before filling, glows, and skips the fill for stroke-only text", () => {
    const ctx = new FakeContext2D();
    drawText(ctx, "A", 0, 0, { stroke: 4, glow: 20, color: "#abcdef" });
    expect(ctx.draws.map((d) => d.op)).toEqual(["stroke", "fill"]);
    expect(ctx.draws[0]).toMatchObject({
      lineWidth: 4,
      strokeStyle: "#abcdef",
      lineJoin: "miter",
      shadowBlur: 20,
      shadowColor: "#abcdef",
    });
    const only = new FakeContext2D();
    drawText(only, "A", 0, 0, {
      stroke: 2,
      strokeOnly: true,
      glow: 5,
      glowColor: "#111111",
    });
    expect(only.draws.map((d) => d.op)).toEqual(["stroke"]);
    expect(only.draws[0]).toMatchObject({
      strokeStyle: PAL.accent,
      shadowColor: "#111111",
    });
  });
});

describe("measure and fitSize", () => {
  it("measures with the requested font and tracking without leaking state", () => {
    const ctx = new FakeContext2D();
    expect(measure(ctx, "AB", { size: 100, tracking: 0.2 })).toBeCloseTo(160);
    expect(ctx.font).toBe("10px sans-serif");
    expect(ctx.letterSpacing).toBe("0px");
  });

  it("keeps the size when the text fits and shrinks it to fit otherwise", () => {
    const ctx = new FakeContext2D();
    expect(fitSize(ctx, "ABCDE", { size: 100 }, 600)).toBe(100);
    const s = fitSize(ctx, "ABCDE", { size: 100 }, 150);
    expect(s).toBeCloseTo(50);
    expect(measure(ctx, "ABCDE", { size: s })).toBeCloseTo(150);
    expect(fitSize(ctx, "ABCDE", {}, 10_000)).toBe(120);
  });
});

describe("drawStagger", () => {
  const settled = (align?: string) => {
    const ctx = new FakeContext2D();
    const tot = drawStagger(ctx, "ABC", 500, 300, 6, 1, { size: 100, align });
    return { tot, d: fills(ctx) };
  };

  it("lays the letters out side by side around the anchor", () => {
    const c = settled();
    expect(c.tot).toBeCloseTo(180);
    expect(c.d.map((d) => d.text)).toEqual(["A", "B", "C"]);
    expect(c.d.map((d) => d.tx)).toEqual([440, 500, 560]);
    for (const d of c.d) {
      expect(d.ty).toBeCloseTo(300);
      expect(d.sx).toBeCloseTo(1);
      expect(d.textAlign).toBe("center");
    }
    expect(settled("left").d.map((d) => d.tx)).toEqual([530, 590, 650]);
    expect(settled("right").d.map((d) => d.tx)).toEqual([350, 410, 470]);
  });

  it("starts each letter `stagger` later, rising into place", () => {
    const ctx = new FakeContext2D();
    drawStagger(ctx, "ABC", 500, 300, 1, 1, { size: 100 });
    const d = fills(ctx);
    expect(d.map((x) => x.text)).toEqual(["A", "B"]);
    expect(d[0].ty).toBeGreaterThan(300);
    expect(d[0].ty).toBeLessThan(360);
    expect(d[1].ty).toBeGreaterThan(d[0].ty);
    expect(d[1].globalAlpha).toBeCloseTo(0.025 / 0.035);
  });

  it("starts a letter a full o.dy below its rest, 60 px by default", () => {
    const justIn = 1 - LEAD + 0.001;
    for (const [o, drop] of [
      [{}, 60],
      [{ dy: 25 }, 25],
    ] as const) {
      const ctx = new FakeContext2D();
      drawStagger(ctx, "A", 500, 300, justIn, 1, { size: 100, ...o });
      const [a] = fills(ctx);
      expect(a.ty).toBe(300 + drop);
      expect(a.sx).toBe(0);
    }
  });

  it("scales alpha and fades every letter out after the end", () => {
    const ctx = new FakeContext2D();
    drawStagger(ctx, "AB", 0, 0, 6, 1, { size: 100, alpha: 0.5 });
    expect(fills(ctx).map((d) => d.globalAlpha)).toEqual([0.5, 0.5]);
    const gone = new FakeContext2D();
    drawStagger(gone, "AB", 0, 0, 2.5, 1, { size: 100, e: 2, out: 0.1 });
    expect(gone.draws).toEqual([]);
  });
});

describe("drawKaraoke", () => {
  const line = {
    s: 1.0,
    e: 1.8,
    words: [
      { w: "go", s: 1.0, e: 1.2 },
      { w: "now", s: 1.5, e: 1.8 },
    ],
  };

  it("lays out uppercase words with a gap and lights the sung ones", () => {
    const ctx = new FakeContext2D();
    const boxes = drawKaraoke(ctx, {}, line, 1.2, {
      x: 500,
      y: 100,
      size: 50,
      glow: 10,
    });
    expect(boxes.map((b) => [b.x, b.w])).toEqual([
      [near(418), 60],
      [near(492), 90],
    ]);
    expect(boxes[1].word.txt).toBe("NOW");
    const [go, now] = fills(ctx);
    expect(go).toMatchObject({
      text: "GO",
      tx: near(448),
      ty: 100,
      fillStyle: PAL.white,
      shadowBlur: 10,
    });
    expect(now).toMatchObject({
      text: "NOW",
      tx: near(537),
      sx: 0.9,
      fillStyle: "rgba(255,176,0,0.28)",
      shadowBlur: 0,
      globalAlpha: 1,
    });
    expect(go.sx).not.toBe(0.9);
  });

  it("lights a word LEAD before its onset, not at it", () => {
    const at = (t: number) => {
      const ctx = new FakeContext2D();
      drawKaraoke(ctx, {}, line, t, { x: 0, y: 0, size: 50 });
      return fills(ctx)[1].fillStyle;
    };
    expect(at(1.5 - LEAD - 0.01)).toBe("rgba(255,176,0,0.28)");
    expect(at(1.5 - LEAD + 0.01)).toBe(PAL.white);
  });

  it("shrinks the whole line, font and gap, to fit maxW", () => {
    const ctx = new FakeContext2D();
    const boxes = drawKaraoke(ctx, {}, line, 1.2, {
      x: 500,
      y: 0,
      size: 50,
      maxW: 82,
    });
    expect(boxes.map((b) => [b.x, b.w])).toEqual([
      [near(459), near(30)],
      [near(496), near(45)],
    ]);
    expect(fills(ctx)[1].font).toBe('900 25px "Archivo"');
    expect(measure(ctx, "NOW", { size: 25 })).toBeCloseTo(boxes[1].w);
    const wide = drawKaraoke(new FakeContext2D(), {}, line, 1.2, {
      x: 500,
      y: 0,
      size: 50,
      maxW: 500,
    });
    expect(wide[0].x).toBeCloseTo(418);
  });

  it("keeps case on request, anchors left or right, and hides the line before its lead", () => {
    const ctx = new FakeContext2D();
    const l = drawKaraoke(ctx, {}, line, 0.5, {
      x: 100,
      y: 0,
      size: 50,
      upper: false,
      align: "left",
      litColor: "#00ff00",
      dimColor: "#333333",
    });
    expect(l[0].x).toBe(100);
    expect(fills(ctx).map((d) => [d.text, d.globalAlpha, d.fillStyle])).toEqual(
      [
        ["go", 0, "#333333"],
        ["now", 0, "#333333"],
      ],
    );
    const r = drawKaraoke(new FakeContext2D(), {}, line, 1.6, {
      x: 500,
      y: 0,
      size: 50,
      align: "right",
    });
    expect(r[0].x).toBeCloseTo(336);
    const after = new FakeContext2D();
    drawKaraoke(after, {}, line, 2.2, { x: 0, y: 0, size: 50 });
    expect(fills(after).map((d) => d.globalAlpha)).toEqual([0, 0]);
  });
});

describe("drawSubtitle", () => {
  const A = { env_fps: 10, env: {}, bpm: 120, beats: [0], downbeats: [0] };
  const L = {
    lines: [
      {
        s: 1.0,
        e: 2.0,
        words: [
          { w: "go", s: 1.0, e: 1.4 },
          { w: "now", s: 1.5, e: 2.0 },
        ],
      },
      {
        s: 4.0,
        e: 6.0,
        words:
          "everything underneath throughout background wonderland heartbreak overnight landscapes"
            .split(" ")
            .map((w, i) => ({ w, s: 4 + i * 0.2, e: 4.2 + i * 0.2 })),
      },
    ],
  };
  const T = makeTimeline(A, L);
  // atFrame is the identity outside a motion-blur sample, as main.js's is in the frame pass
  const frame = (t: number) => t;
  const landscape = (S = 1) => ({
    lineAt: T.lineAt,
    atFrame: frame,
    SAFE: { x: 0, y: 0, w: 1920 * S, h: 1080 * S },
    SCALE: S,
    CANVAS: [1920, 1080],
    W: 1920 * S,
    H: 1080 * S,
    ORIENT: "landscape",
  });
  const portrait = {
    lineAt: T.lineAt,
    atFrame: frame,
    SAFE: { x: 0, y: 200, w: 1080, h: 1400 },
    SCALE: 1,
    CANVAS: [1080, 1920],
    W: 1080,
    H: 1920,
    ORIENT: "portrait",
  };
  const bar = (ctx: FakeContext2D) =>
    ctx.calls.filter((c) => c[0] === "fillRect");

  it("draws nothing outside a line's window", () => {
    for (const t of [0.5, 2.6]) {
      const ctx = new FakeContext2D();
      drawSubtitle(ctx, landscape(), t);
      expect(ctx.draws).toEqual([]);
      expect(ctx.calls).toEqual([]);
    }
  });

  it("keeps a full-frame 1080-high canvas at y 990, at any scale", () => {
    for (const S of [1, 2]) {
      const ctx = new FakeContext2D();
      drawSubtitle(ctx, landscape(S), 1.2);
      const [, x, y, w, h, style, alpha] = bar(ctx)[0];
      expect([x, y, w, h]).toEqual([
        96 * S - 18 * S,
        990 * S - 26 * S * 0.55,
        4 * S,
        26 * S * 1.1,
      ]);
      expect([style, alpha]).toEqual([PAL.accent, 1]);
      const [first] = fills(ctx);
      expect(first.font).toBe(`600 ${26 * S}px "JetBrains Mono"`);
      expect(first.ty).toBe(990 * S);
      expect(first.tx).toBeCloseTo(
        96 * S + measure(ctx, "GO", { size: 26 * S, tracking: 0.06 }) / 2,
      );
      expect(ctx.stack).toEqual([]);
    }
  });

  it("leaves y 990 once the safe band is inset from the top", () => {
    const ctx = new FakeContext2D();
    drawSubtitle(
      ctx,
      { ...landscape(), SAFE: { x: 0, y: 40, w: 1920, h: 1080 } },
      1.2,
    );
    expect(fills(ctx)[0].ty).toBe(40 + 1080 - 90);
  });

  it("sits 90 px above the safe band's bottom and fits a long line inside it", () => {
    const ctx = new FakeContext2D();
    drawSubtitle(ctx, portrait, 4.5);
    const d = fills(ctx);
    expect(d[0].ty).toBe(1510);
    const lastW = measure(ctx, d.at(-1)!.text, {
      size: parseFloat(/(\d+(\.\d+)?)px/.exec(d.at(-1)!.font)![1]),
      tracking: 0.06,
    });
    // fontStr rounds the shrunk size to whole pixels, so the drawn word may run a pixel or two past
    expect(d.at(-1)!.tx + lastW / 2).toBeLessThanOrEqual(1080 - 52 + 3);
    expect(d.at(-1)!.tx + lastW / 2).toBeGreaterThan(1080 - 52 - 30);
    const free = new FakeContext2D();
    drawSubtitle(free, { ...portrait, ORIENT: "landscape" }, 4.5);
    expect(fills(free).at(-1)!.tx).toBeGreaterThan(1080);
  });

  it("takes an explicit position in unscaled pixels", () => {
    const ctx = new FakeContext2D();
    drawSubtitle(ctx, landscape(2), 1.2, { x: 100, y: 200 });
    expect(bar(ctx)[0].slice(1, 3)).toEqual([200 - 36, 400 - 52 * 0.55]);
    expect(fills(ctx)[0].ty).toBe(400);
  });

  it("draws at the output frame's time inside a motion-blur sample", () => {
    const at = (t: number) => t + 1;
    const ctx = new FakeContext2D();
    drawSubtitle(ctx, { ...landscape(), atFrame: at }, 0.2);
    const sharp = new FakeContext2D();
    drawSubtitle(sharp, landscape(), 1.2);
    expect(ctx.draws).toEqual(sharp.draws);
    expect(ctx.calls).toEqual(sharp.calls);
    expect(fills(ctx).map((d) => d.text)).toEqual(["GO", "NOW"]);
    const gone = new FakeContext2D();
    drawSubtitle(gone, { ...landscape(), atFrame: at }, 1.6);
    expect(gone.draws).toEqual([]);
    expect(gone.calls).toEqual([]);
  });

  it("dims the accent bar with o.alpha", () => {
    const ctx = new FakeContext2D();
    drawSubtitle(ctx, landscape(), 1.2, { alpha: 0.5 });
    expect(bar(ctx)[0][6]).toBe(0.5);
  });

  it("dims the words with o.alpha too", () => {
    const ctx = new FakeContext2D();
    drawSubtitle(ctx, landscape(), 1.2, { alpha: 0.5 });
    for (const d of fills(ctx)) expect(d.globalAlpha).toBeCloseTo(0.5);
  });
});

describe("blitG2D", () => {
  it("draws the 2D layer's texture fullscreen at the given intensity and blending", () => {
    const renderer = fakeRenderer();
    const E = { renderer };
    blitG2D(E, { tex: "texA" }, 2.5);
    const [, scene, cam] = renderer.calls[0] as any[];
    const mat = scene.children[0].material;
    expect(mat.map).toBe("texA");
    expect([mat.color.r, mat.color.g, mat.color.b]).toEqual([2.5, 2.5, 2.5]);
    expect(mat.blending).toBe(NormalBlending);
    expect(mat).toMatchObject({
      transparent: true,
      depthTest: false,
      toneMapped: false,
    });
    expect([cam.left, cam.right, cam.top, cam.bottom]).toEqual([-1, 1, 1, -1]);

    blitG2D(E, { tex: "texB" }, 1, AdditiveBlending);
    const [, scene2] = renderer.calls[1] as any[];
    expect(scene2).toBe(scene);
    expect(mat.map).toBe("texB");
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.color.r).toBe(1);
  });
});
