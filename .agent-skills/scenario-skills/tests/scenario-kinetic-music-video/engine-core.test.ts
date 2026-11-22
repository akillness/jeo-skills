import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canvases,
  fakeDocument,
  fakeRenderer,
  restoreGlobals,
  setGlobal,
  loads,
  SRGBColorSpace,
} from "./core-kit-fakes.ts";
import {
  clamp,
  col,
  ease,
  fract,
  FSQuad,
  hash1,
  lerp,
  loadFont3D,
  loadVideo,
  makeG2D,
  makeTimeline,
  noise1,
  noise2,
  PAL,
  remap,
  rng,
  spring,
  stretchKW,
  text3D,
  textCanvas,
  textTexture,
  tween,
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

beforeEach(() => {
  setGlobal("document", fakeDocument);
});
afterEach(() => {
  restoreGlobals();
});

describe("scalar helpers", () => {
  it("clamps to [0, 1] by default and to a given range", () => {
    expect(clamp(1.5)).toBe(1);
    expect(clamp(-1)).toBe(0);
    expect(clamp(0.3)).toBe(0.3);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-3, -2, 2)).toBe(-2);
  });

  it("lerps, remaps with clamping, and takes the fractional part", () => {
    expect(lerp(2, 4, 0.25)).toBe(2.5);
    expect(remap(5, 0, 10)).toBe(0.5);
    expect(remap(2.5, 0, 10, 100, 200)).toBe(125);
    expect(remap(15, 0, 10, 100, 200)).toBe(200);
    expect(remap(-5, 0, 10, 100, 200)).toBe(100);
    expect(fract(2.75)).toBeCloseTo(0.75);
    expect(fract(-0.25)).toBeCloseTo(0.75);
  });

  it("maps font-stretch percentages to the nearest CSS keyword", () => {
    expect(stretchKW(undefined)).toBe("normal");
    expect(stretchKW("normal")).toBe("normal");
    expect(stretchKW("condensed")).toBe("condensed");
    expect(stretchKW("75%")).toBe("condensed");
    expect(stretchKW("80%")).toBe("condensed");
    expect(stretchKW("130%")).toBe("expanded");
    expect(stretchKW("200%")).toBe("extra-expanded");
    expect(stretchKW("10%")).toBe("ultra-condensed");
    expect(stretchKW(112)).toBe("semi-expanded");
  });
});

describe("ease", () => {
  it("starts at 0 and ends at 1 for every curve", () => {
    for (const [name, fn] of Object.entries(ease)) {
      expect(fn(0), name).toBeCloseTo(0);
      expect(fn(1), name).toBeCloseTo(1);
    }
  });

  it("matches the standard curves at known points", () => {
    expect(ease.linear(0.3)).toBe(0.3);
    expect(ease.inQuad(0.5)).toBe(0.25);
    expect(ease.outQuad(0.5)).toBe(0.75);
    expect(ease.inOutQuad(0.25)).toBe(0.125);
    expect(ease.inOutQuad(0.75)).toBe(0.875);
    expect(ease.inCubic(0.5)).toBe(0.125);
    expect(ease.outCubic(0.5)).toBe(0.875);
    expect(ease.inOutCubic(0.25)).toBe(0.0625);
    expect(ease.inOutCubic(0.75)).toBe(0.9375);
    expect(ease.inQuart(0.5)).toBe(0.0625);
    expect(ease.outQuart(0.5)).toBe(0.9375);
    expect(ease.inOutQuart(0.25)).toBe(0.03125);
    expect(ease.inOutQuart(0.75)).toBe(0.96875);
    expect(ease.outExpo(0.5)).toBeCloseTo(1 - 1 / 32);
    expect(ease.inExpo(0.5)).toBeCloseTo(1 / 32);
    expect(ease.inOutExpo(0.25)).toBeCloseTo(1 / 64);
    expect(ease.inOutExpo(0.5)).toBeCloseTo(0.5);
    expect(ease.smooth(0.25)).toBe(0.15625);
  });

  it("keeps the in-out curves point-symmetric about the midpoint", () => {
    for (const fn of [
      ease.inOutQuad,
      ease.inOutCubic,
      ease.inOutQuart,
      ease.inOutExpo,
      ease.smooth,
    ])
      for (const x of [0.1, 0.3, 0.45])
        expect(fn(x) + fn(1 - x)).toBeCloseTo(1);
  });

  it("overshoots with back and elastic, and anticipates with inBack", () => {
    expect(ease.outBack(0.7)).toBeGreaterThan(1);
    expect(ease.outElastic(0.1)).toBeCloseTo(1.25);
    expect(ease.inBack(0.2)).toBeLessThan(0);
    expect(ease.outBack(0.7, 0)).toBeCloseTo(ease.outCubic(0.7));
  });

  it("tweens over a window, holding the ends outside it", () => {
    expect(tween(0.5, 1, 2)).toBe(0);
    expect(tween(2, 1, 2, ease.linear)).toBe(0.5);
    expect(tween(9, 1, 2)).toBe(1);
  });
});

describe("spring", () => {
  it("rests at 0 before the impulse and settles at 1", () => {
    expect(spring(0)).toBe(0);
    expect(spring(-1)).toBe(0);
    expect(spring(3)).toBeCloseTo(1, 5);
  });

  it("peaks where second-order theory puts the first overshoot", () => {
    const k = 260,
      z = 0.42;
    const wd = Math.sqrt(k) * Math.sqrt(1 - z * z);
    const peak = 1 + Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z));
    expect(spring(Math.PI / wd)).toBeCloseTo(peak, 6);
    expect(spring(Math.PI / wd - 0.02)).toBeLessThan(peak);
    expect(spring(Math.PI / wd + 0.02)).toBeLessThan(peak);
  });

  it("overshoots less with more damping", () => {
    const peak = (z: number) => {
      let m = 0;
      for (let t = 0; t < 1; t += 0.001) m = Math.max(m, spring(t, 260, z));
      return m;
    };
    expect(peak(0.8)).toBeLessThan(peak(0.42));
  });
});

describe("deterministic randomness", () => {
  it("replays the same sequence for the same seed", () => {
    const a = rng(7),
      b = rng(7),
      c = rng(8);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
  });

  it("is mulberry32, so a seed renders the same frames across engine versions", () => {
    const r = rng(1);
    expect([r(), r(), r()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
    const d = rng();
    expect(d()).toBe(0.6270739405881613);
  });

  it("treats seeds as unsigned 32-bit and stays in [0, 1) with a fair mean", () => {
    const a = rng(-1),
      b = rng(4294967295);
    expect(a()).toBe(b());
    const r = rng(42);
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 2000).toBeCloseTo(0.5, 1);
  });

  it("keeps value noise in [-1, 1], continuous, and pinned to the hash at integers", () => {
    for (let i = -5; i <= 5; i++) {
      expect(hash1(i)).toBeGreaterThanOrEqual(0);
      expect(hash1(i)).toBeLessThan(1);
      expect(noise1(i)).toBeCloseTo(hash1(i) * 2 - 1, 10);
    }
    for (let x = -3; x < 3; x += 0.37) {
      expect(Math.abs(noise1(x))).toBeLessThanOrEqual(1);
      expect(Math.abs(noise1(x + 1e-6) - noise1(x))).toBeLessThan(1e-4);
      for (let y = -2; y < 2; y += 0.53) {
        const n = noise2(x, y);
        expect(Math.abs(n)).toBeLessThanOrEqual(1);
        expect(noise2(x, y)).toBe(n);
        expect(Math.abs(noise2(x + 1e-6, y + 1e-6) - n)).toBeLessThan(1e-4);
      }
    }
    const lattice = new Set<number>();
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) lattice.add(noise2(i, j));
    expect(lattice.size).toBe(16);
  });
});

describe("PAL", () => {
  it("keeps the role keys the HUD and templates read, as sRGB hex", () => {
    for (const k of ["black", "ink", "white", "accent"])
      expect(PAL[k]).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe("makeTimeline", () => {
  const A = {
    env_fps: 10,
    env: { rms: [0, 1, 0.5, 0.5] },
    bpm: 120,
    beats: [0, 0.5, 1.0, 1.5, 2.0, 2.5],
    downbeats: [0, 2.0],
    onsets: [0.2, 0.7],
  };
  const L = {
    lines: [
      {
        s: 1.0,
        e: 2.0,
        section: "verse",
        words: [
          { w: "hello", s: 1.0, e: 1.4 },
          { w: "world", s: 1.5, e: 2.0 },
        ],
      },
      {
        s: 3.0,
        e: 4.0,
        section: "chorus",
        words: [{ w: "again", s: 3.0, e: 3.6 }],
      },
    ],
  };
  const E = makeTimeline(A, L);

  it("exposes tempo facts", () => {
    expect(E.fps).toBe(10);
    expect(E.bpm).toBe(120);
    expect(E.spb).toBe(0.5);
  });

  it("interpolates an envelope between frames and holds its ends", () => {
    expect(E.env("rms", 0.05)).toBeCloseTo(0.5);
    expect(E.env("rms", 0.15)).toBeCloseTo(0.75);
    expect(E.env("rms", -1)).toBe(0);
    expect(E.env("rms", 5)).toBe(0.5);
  });

  it("averages an envelope over a trailing window", () => {
    expect(E.envAvg("rms", 0.1, 0.1)).toBeCloseTo(0.5);
    expect(E.envAvg("rms", 0.1, 0)).toBeCloseTo(1);
  });

  it("finds the last and next event around a time", () => {
    expect(E.last("beats", 0.7)).toEqual({
      i: 1,
      t: 0.5,
      dt: expect.closeTo(0.2),
    });
    expect(E.last("beats", -0.1)).toBeNull();
    expect(E.last("beats", 1.0)).toEqual({ i: 2, t: 1.0, dt: 0 });
    expect(E.next("beats", 0.7)).toEqual({
      i: 2,
      t: 1.0,
      dt: expect.closeTo(0.3),
    });
    expect(E.next("beats", 1.0)?.t).toBe(1.5);
    expect(E.next("beats", 2.6)).toBeNull();
  });

  it("decays a pulse from the last event, honoring a lead", () => {
    expect(E.pulse("onsets", 0.1)).toBe(0);
    expect(E.pulse("onsets", 0.2)).toBe(1);
    expect(E.pulse("onsets", 0.32)).toBeCloseTo(Math.exp(-1));
    expect(E.pulse("onsets", 0.3, 0.05)).toBeCloseTo(Math.exp(-2));
    expect(E.pulse("onsets", 0.1, 0.12, 0.1)).toBe(1);
  });

  it("places a time within its beat and bar", () => {
    expect(E.beat(0.75)).toMatchObject({
      i: 1,
      t0: 0.5,
      t1: 1.0,
      phase: 0.5,
      bar: 0,
      barT0: 0,
      inBar: 1,
      isDown: false,
      len: 0.5,
    });
    const down = E.beat(2.1);
    expect(down).toMatchObject({
      i: 4,
      bar: 1,
      barT0: 2.0,
      inBar: 0,
      isDown: true,
    });
    expect(down.phase).toBeCloseTo(0.2);
  });

  it("extends the last beat by one beat length and clamps before the first", () => {
    expect(E.beat(2.75)).toMatchObject({
      i: 5,
      t0: 2.5,
      t1: 3.0,
      phase: 0.5,
      inBar: 1,
    });
    expect(E.beat(-0.3)).toMatchObject({
      i: 0,
      phase: 0,
      bar: 0,
      isDown: true,
    });
  });

  it("flattens words with their line, section and indices", () => {
    expect(E.words.map((w) => w.w)).toEqual(["hello", "world", "again"]);
    expect(E.words[1]).toMatchObject({ li: 0, wi: 1, section: "verse" });
    expect(E.words[1].line).toBe(L.lines[0]);
    expect(E.words[2]).toMatchObject({ li: 1, wi: 0, section: "chorus" });
  });

  it("finds the current line with a lead and the current word", () => {
    expect(E.lineAt(0.7)).toBeNull();
    expect(E.lineAt(0.85)).toBe(L.lines[0]);
    expect(E.lineAt(2.85)).toBe(L.lines[1]);
    expect(E.lineAt(2.85, 0)).toBe(L.lines[0]);
    expect(E.lineAt(1.0, 0)).toBe(L.lines[0]);
    expect(E.lineAt(0.99, 0)).toBeNull();
    expect(E.wordAt(0.5)).toBeNull();
    expect(E.wordAt(1.49)?.w).toBe("hello");
    expect(E.wordAt(1.5)?.w).toBe("world");
    expect(E.wordAt(1.45, 0.1)?.w).toBe("world");
    expect(E.wordAt(10)?.w).toBe("again");
  });

  it("selects words starting in a half-open window and lines by section", () => {
    expect(E.wordsIn(1.0, 3.0).map((w) => w.w)).toEqual(["hello", "world"]);
    expect(E.wordsIn(1.1, 3.01).map((w) => w.w)).toEqual(["world", "again"]);
    expect(E.section("chorus")).toEqual([L.lines[1]]);
    expect(E.section("bridge")).toEqual([]);
  });
});

describe("textCanvas", () => {
  it("sizes the canvas to the text plus padding and draws it centered vertically", () => {
    const r = textCanvas("ABCD", { size: 100, font: "Unit A" });
    expect(r.textW).toBe(240);
    expect(r.pad).toBe(35);
    expect(r.w).toBe(310);
    expect(r.h).toBe(195);
    expect(r.canvas.width).toBe(310);
    expect(r.canvas.height).toBe(195);
    const [fill] = r.canvas.ctx.draws;
    expect(fill).toMatchObject({ op: "fill", text: "ABCD", x: 35, y: 97.5 });
    expect(fill.font).toBe('900 100px "Unit A"');
    expect(fill.fillStyle).toBe(PAL.white);
    expect(fill.textBaseline).toBe("middle");
  });

  it("reapplies font, stretch and tracking after the resize resets the context", () => {
    const r = textCanvas("AB", {
      size: 50,
      font: "Unit B",
      stretch: "75%",
      tracking: 0.1,
      italic: true,
      weight: 400,
      pad: 10,
      lineH: 1,
    });
    expect(r.textW).toBe(2 * 30 + 2 * 5);
    expect(r.w).toBe(90);
    expect(r.h).toBe(70);
    const [fill] = r.canvas.ctx.draws;
    expect(fill.font).toBe('italic 400 75% 50px "Unit B"');
    expect(fill.fontStretch).toBe("condensed");
    expect(fill.letterSpacing).toBe("5px");
  });

  it("strokes before filling, glows, and skips the fill for stroke-only text", () => {
    const r = textCanvas("X", {
      size: 40,
      font: "Unit C",
      stroke: 3,
      glow: 12,
      color: "#123456",
    });
    const ops = r.canvas.ctx.draws;
    expect(ops.map((d) => d.op)).toEqual(["stroke", "fill"]);
    expect(ops[0]).toMatchObject({
      lineWidth: 3,
      strokeStyle: "#123456",
      shadowBlur: 12,
      shadowColor: "#123456",
    });
    expect(ops[1].fillStyle).toBe("#123456");
    const s = textCanvas("X", {
      size: 40,
      font: "Unit C",
      stroke: 2,
      strokeOnly: true,
    });
    expect(s.canvas.ctx.draws.map((d) => d.op)).toEqual(["stroke"]);
    expect(s.canvas.ctx.draws[0].strokeStyle).toBe(PAL.accent);
  });

  it("caches by text and options", () => {
    const n = canvases.length;
    const a = textCanvas("cache", { size: 30, font: "Unit D" });
    expect(textCanvas("cache", { size: 30, font: "Unit D" })).toBe(a);
    expect(canvases.length).toBe(n + 1);
    expect(textCanvas("cache", { size: 31, font: "Unit D" })).not.toBe(a);
  });
});

describe("textTexture", () => {
  it("wraps the text canvas in an sRGB texture with its aspect, cached", () => {
    const t = textTexture("TEX", { size: 100, font: "Unit E" });
    expect(t.tex.image).toBe(t.canvas);
    expect(t.tex.colorSpace).toBe(SRGBColorSpace);
    expect(t.tex.generateMipmaps).toBe(true);
    expect(t.aspect).toBeCloseTo(t.w / t.h);
    expect(textTexture("TEX", { size: 100, font: "Unit E" })).toBe(t);
  });
});

describe("3D text", () => {
  it("refuses a font that was never loaded", () => {
    expect(() => text3D("A", { font: "Missing" })).toThrow(
      "font not loaded: Missing",
    );
  });

  it("loads a font once and centers the geometry on its bounding box", async () => {
    const f = await loadFont3D("ArchivoBlack", "/fonts/a.ttf");
    expect(await loadFont3D("ArchivoBlack", "/fonts/other.ttf")).toBe(f);
    expect(loads).toEqual(["/fonts/a.ttf"]);

    const g = text3D("ABC", { size: 2 });
    expect(g.params).toMatchObject({
      font: f,
      size: 2,
      depth: 0.3,
      curveSegments: 6,
      bevelEnabled: true,
    });
    const [[dx, dy, dz]] = g.translations;
    expect(dx).toBeCloseTo(-(1 + 1 + 6) / 2);
    expect(dy).toBeCloseTo(-(2 + 4) / 2);
    expect(dz).toBeCloseTo(0.15);
    const bb = g.boundingBox;
    expect(bb.min.x + bb.max.x).toBeCloseTo(0);
    expect(bb.min.y + bb.max.y).toBeCloseTo(0);
    expect(bb.min.z + bb.max.z).toBeCloseTo(0);
    expect(text3D("ABC", { size: 2 })).toBe(g);
  });

  it("leaves the geometry in place when centering is off", async () => {
    await loadFont3D("ArchivoBlack", "/fonts/a.ttf");
    const g = text3D("Z", { center: false, depth: 1, bevel: false });
    expect(g.translations).toEqual([]);
    expect(g.params).toMatchObject({ depth: 1, bevelEnabled: false });
  });
});

describe("FSQuad", () => {
  it("swaps its material and renders into a target, clearing only when asked", () => {
    const q = new FSQuad("m1");
    expect(q.material).toBe("m1");
    q.material = "m2";
    expect(q.mesh.material).toBe("m2");
    expect(q.scene.children).toEqual([q.mesh]);

    const r = fakeRenderer();
    q.render(r, "rt");
    q.render(r, null, true);
    expect(r.calls).toEqual([
      ["setRenderTarget", "rt"],
      ["render", q.scene, q.cam],
      ["setRenderTarget", null],
      ["clear"],
      ["render", q.scene, q.cam],
    ]);
  });
});

describe("makeG2D", () => {
  it("sizes a canvas, clears it whole under an identity transform, and flags the upload", () => {
    const g = makeG2D(640, 360);
    expect([g.canvas.width, g.canvas.height]).toEqual([640, 360]);
    expect(g.tex.image).toBe(g.canvas);
    g.clear();
    expect(g.ctx.calls).toEqual([
      ["setTransform", 1, 0, 0, 1, 0, 0],
      ["clearRect", 0, 0, 640, 360],
    ]);
    expect(g.tex.needsUpdate).toBe(false);
    g.commit();
    expect(g.tex.needsUpdate).toBe(true);
  });
});

describe("col", () => {
  it("scales a palette color for HDR", () => {
    const base = col("#804020");
    const hot = col("#804020", 3);
    expect(hot.r).toBeCloseTo(base.r * 3);
    expect(hot.g).toBeCloseTo(base.g * 3);
    expect(hot.b).toBeCloseTo(base.b * 3);
  });
});

describe("loadVideo", () => {
  let fetched: string[];
  let json: Record<string, unknown>;

  beforeEach(() => {
    fetched = [];
    json = {};
    setGlobal("fetch", async (url: string) => {
      fetched.push(url);
      return {
        json: async () => {
          if (!(url in json)) throw new Error(`no json at ${url}`);
          return json[url];
        },
        blob: async () => ({ url }),
      };
    });
    setGlobal("createImageBitmap", async (b: { url: string }, o: unknown) => ({
      from: b.url,
      o,
    }));
  });

  const frames = () => fetched.filter((u) => /\/[fm]_\d+/.test(u));

  it("maps clip time to a 1-based frame, clamped to the clip, and prefetches the next", async () => {
    json["/assets/video/clipA/meta.json"] = {
      n: 10,
      fps: 10,
      w: 1920,
      h: 1080,
    };
    const v = await loadVideo("clipA");
    expect(await v.frame(0.35)).toBe(4);
    expect(v.tex.image).toEqual({
      from: "/assets/video/clipA/f_00004.jpg",
      o: { imageOrientation: "flipY" },
    });
    expect(v.tex.needsUpdate).toBe(true);
    expect(frames()).toEqual([
      "/assets/video/clipA/f_00004.jpg",
      "/assets/video/clipA/f_00005.jpg",
    ]);
    expect(await v.frame(-1)).toBe(1);
    expect(await v.frame(100)).toBe(10);
    expect(v.cur).toBe(10);
    expect(v.i).toBe(10);
    expect(await loadVideo("clipA")).toBe(v);
  });

  it("serves a repeated frame from cache without refetching", async () => {
    json["/assets/video/clipB/meta.json"] = { n: 10, fps: 10, ext: "png" };
    const v = await loadVideo("clipB");
    await v.frame(0.1);
    await v.frame(0.15);
    await v.frame(0.2);
    await v.frame(0.1);
    expect(frames()).toEqual([
      "/assets/video/clipB/f_00002.png",
      "/assets/video/clipB/f_00003.png",
      "/assets/video/clipB/f_00004.png",
    ]);
  });

  it("evicts the oldest frames past 90 cached", async () => {
    json["/assets/video/clipC/meta.json"] = { n: 200, fps: 1, mask: true };
    const v = await loadVideo("clipC");
    for (let k = 0; k < 95; k++) await v.frame(k);
    const count = (name: string) =>
      fetched.filter((u) => u.endsWith(name)).length;
    await v.frame(49);
    expect(count("f_00050.jpg")).toBe(1);
    expect(count("m_00050.png")).toBe(1);
    await v.frame(0);
    expect(count("f_00001.jpg")).toBe(2);
    expect(count("m_00001.png")).toBe(2);
  });

  it("time-warps clip time through piecewise-linear points", async () => {
    json["/assets/video/clipD/meta.json"] = {
      n: 50,
      fps: 10,
      warp: [
        [1, 1],
        [2, 3],
      ],
    };
    const v = await loadVideo("clipD");
    expect(await v.frame(0.5)).toBe(6);
    expect(await v.frame(1.5)).toBe(21);
    expect(await v.frame(2.5)).toBe(36);
  });

  it("loads the matte frame beside the color frame", async () => {
    json["/assets/video/clipE/meta.json"] = { n: 10, fps: 10, mask: true };
    const v = await loadVideo("clipE");
    await v.frame(0.35);
    expect(v.mtex.image).toMatchObject({
      from: "/assets/video/clipE/m_00004.png",
    });
    expect(v.mtex.needsUpdate).toBe(true);
    expect(frames()).toContain("/assets/video/clipE/m_00005.png");
  });

  it("looks up tracking per frame, clamped, and returns null without it", async () => {
    json["/assets/video/clipF/meta.json"] = {
      n: 10,
      fps: 10,
      track: true,
      warp: [
        [0, 0],
        [1, 0.5],
      ],
    };
    json["/assets/video/clipF/track.json"] = ["t0", "t1", "t2", "t3"];
    const v = await loadVideo("clipF");
    expect(v.trackAt(0.4)).toBe("t2");
    expect(v.trackAt(9)).toBe("t3");
    expect(v.trackAt(-1)).toBe("t0");

    json["/assets/video/clipG/meta.json"] = { n: 10, fps: 10, track: true };
    const broken = await loadVideo("clipG");
    expect(broken.track).toBeNull();
    expect(broken.trackAt(0.2)).toBeNull();

    json["/assets/video/clipH/meta.json"] = { n: 10, fps: 10 };
    const none = await loadVideo("clipH");
    expect(fetched).not.toContain("/assets/video/clipH/track.json");
    expect(none.trackAt(0.2)).toBeNull();
  });
});
