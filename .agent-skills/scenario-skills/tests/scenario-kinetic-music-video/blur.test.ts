import { describe, expect, it } from "vitest";
import { onCanvas } from "../../skills/scenario-kinetic-music-video/assets/engine/canvas.js";
import {
  cutEntries,
  cutList,
  DEFAULTS,
  EPS,
  framePlan,
  layerBlur,
  passes,
  replayIndex,
  resolveBlur,
  sampleCount,
  sampleTimes,
  shutterScale,
  shutterWindow,
} from "../../skills/scenario-kinetic-music-video/assets/engine/blur.js";

const on = { ...DEFAULTS, on: true };
const none = { cuts: [0], fasts: [], shutters: [], sharps: [] };
// seeded, so a failure reproduces
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
const crosses = (a: number, b: number, cuts: number[]) =>
  cuts.some((c) => a < c && c <= b);

describe("resolveBlur", () => {
  it("is off by default and on with --blur", () => {
    expect(resolveBlur({}, undefined).on).toBe(false);
    expect(resolveBlur({ blur: "on" }, undefined)).toEqual({ ...on });
    expect(resolveBlur({ blur: "12" }, undefined)).toMatchObject({
      on: true,
      samples: 12,
    });
  });

  it("lets the query override the project", () => {
    for (const v of ["off", "0", "1"])
      expect(resolveBlur({ blur: v }, { on: true }).on).toBe(false);
    expect(resolveBlur({}, { on: true, samples: 6 })).toMatchObject({
      on: true,
      samples: 6,
    });
    expect(
      resolveBlur({ blur: "on", shutter: "360", blurmax: "12" }, undefined),
    ).toMatchObject({ shutter: 360, max: 12 });
  });

  it("ignores the project setting in previews below scale 1 unless asked", () => {
    expect(resolveBlur({}, { on: true }, 0.5).on).toBe(false);
    // ignored, but still checked, as when a query overrides it
    expect(() => resolveBlur({}, { on: "yes" }, 0.5)).toThrow(/on "yes"/);
    expect(() => resolveBlur({ blur: "off" }, { on: "yes" })).toThrow(
      /on "yes"/,
    );
    expect(resolveBlur({ blur: "on" }, { samples: 6 }, 0.5)).toMatchObject({
      on: true,
      samples: 6,
    });
  });

  it("refuses values it cannot use, naming them", () => {
    expect(() => resolveBlur({ blur: "fast" }, undefined)).toThrow(/"fast"/);
    expect(() => resolveBlur({ blur: "on", shutter: "0" }, undefined)).toThrow(
      /shutter 0/,
    );
    expect(() => resolveBlur({ shutter: "900" }, undefined)).toThrow(
      /shutter 900/,
    );
    expect(() => resolveBlur({}, { samples: 2.5 })).toThrow(/samples 2.5/);
    expect(() => resolveBlur({}, { sampels: 8 })).toThrow(/BLUR.sampels/);
    expect(() => resolveBlur({}, { on: "yes" })).toThrow(
      /BLUR in timeline.js: on "yes"/,
    );
    expect(() => resolveBlur({}, { beatCuts: 1 })).toThrow(/beatCuts 1/);
    expect(() => resolveBlur({ blur: "12" }, { max: 0 })).toThrow(/max 0/);
    expect(() => resolveBlur({}, true)).toThrow(/object/);
  });

  it("refuses a base count above max, which no frame would render", () => {
    expect(() => resolveBlur({ blur: "32" }, undefined)).toThrow(
      /samples 32 above max 24/,
    );
    expect(() => resolveBlur({ blur: "on", blurmax: "4" }, undefined)).toThrow(
      /samples 8 above max 4/,
    );
    expect(() => resolveBlur({}, { samples: 12, max: 8 })).toThrow(
      /BLUR in timeline.js: samples 12 above max 8/,
    );
    const o = resolveBlur({ blur: "32", blurmax: "32" }, undefined);
    expect(framePlan(1, 60, o, none)).toHaveLength(o.samples);
  });

  it("names the remedy that clears the refusal", () => {
    // the project check reads only timeline.js, so no flag clears it
    const project = { on: true, samples: 32 };
    for (const q of [{}, { blurmax: "32" }, { blur: "32", blurmax: "32" }])
      expect(() => resolveBlur(q, project)).toThrow(
        /^BLUR in timeline.js: samples 32 above max 24, raise BLUR.max or lower BLUR.samples$/,
      );
    expect(resolveBlur({}, { ...project, max: 32 }).samples).toBe(32);
    expect(() => resolveBlur({ blur: "32" }, undefined)).toThrow(
      /^motion blur: samples 32 above max 24, raise --blur-max or pass a smaller --blur$/,
    );
  });

  it("skips the max check on a run that stays sharp", () => {
    // still.mjs sends blur=off unless given --blur
    expect(resolveBlur({ blur: "off", blurmax: "4" }, undefined).on).toBe(
      false,
    );
    // a preview ignores the project's 4 samples, leaving the default 8
    expect(
      resolveBlur({ blurmax: "4" }, { on: true, samples: 4 }, 0.5).on,
    ).toBe(false);
  });
});

describe("layerBlur", () => {
  it("reads the entry, else the scene's default export", () => {
    expect(layerBlur(undefined, undefined, "a")).toEqual({
      sharp: false,
      floor: 0,
    });
    expect(layerBlur(undefined, false, "hud").sharp).toBe(true);
    expect(layerBlur(true, false, "hud").sharp).toBe(false);
    expect(layerBlur(0, undefined, "a").sharp).toBe(true);
    expect(layerBlur(12, undefined, "a")).toEqual({ sharp: false, floor: 12 });
  });

  it("refuses anything else, naming the entry", () => {
    for (const v of [1, 2.5, -3, "off", null, {}])
      expect(() => layerBlur(v, undefined, "verse")).toThrow(/^verse: blur/);
  });
});

describe("cutList", () => {
  const entries = [
    { start: 0, end: 4 },
    { start: 4, end: 9.5 },
    { start: 0, end: 9999 },
  ];
  const words = [{ s: 1.2 }, { s: 2.0 }];

  it("holds entry bounds, word switches and registered cuts, sorted and unique", () => {
    const c = cutList(entries, {
      beats: [0.5, 1],
      words,
      lead: 0.05,
      extra: [3.3, 4, NaN, Infinity],
    });
    expect(c).toEqual([0, 1.15, 1.95, 3.3, 4, 9.5, 9999]);
  });

  it("adds beats only when asked, drops words when told", () => {
    const o = { ...DEFAULTS, beatCuts: true, wordCuts: false };
    expect(cutList(entries, { beats: [0.5, 1], words, o })).toEqual([
      0, 0.5, 1, 4, 9.5, 9999,
    ]);
  });
});

describe("cutEntries", () => {
  const TL = [
    { id: "intro", start: 0, end: 16.66 },
    { id: "hook", start: 16.66, end: 37.6, canvas: "landscape" },
    { id: "hook_v", start: 16.66, end: 37.6, canvas: "portrait" },
    { id: "outro", start: 140, end: 150, variant: "a" },
    { id: "outro_b", start: 140, end: 153, variant: "b" },
    { id: "hud", start: 0, end: 9999 },
  ];
  const land = { onCanvas: (e: object) => onCanvas(e, "landscape") };
  const pick = (...ids: string[]) => TL.filter((e) => ids.includes(e.id));
  const ids = (es: { id: string }[]) => es.map((e) => e.id);

  it("takes every entry on this canvas in the render's variant", () => {
    const full = cutEntries(TL, {
      ...land,
      loaded: pick("intro", "hook", "outro", "hud"),
    });
    expect(ids(full)).toEqual(["intro", "hook", "outro", "hud"]);
    const b = cutEntries(TL, {
      ...land,
      variant: "b",
      loaded: pick("intro", "hook", "outro_b", "hud"),
    });
    expect(ids(b)).toEqual(["intro", "hook", "outro_b", "hud"]);
  });

  it("gives an --only preview of a variant the cuts of that variant's full render", () => {
    const only = cutEntries(TL, { ...land, loaded: pick("outro_b", "hud") });
    expect(ids(only)).toEqual(["intro", "hook", "outro_b", "hud"]);
    const cuts = cutList(only);
    expect(cuts).toContain(153);
    expect(cuts).not.toContain(150);
    // both endings loaded at once: each keeps its own bounds
    const both = cutEntries(TL, { ...land, loaded: pick("outro", "outro_b") });
    expect(ids(both)).toEqual(["intro", "hook", "outro", "outro_b", "hud"]);
  });

  it("skips another entry's unreadable canvas tag, so only renders loading it fail", () => {
    const bad = { id: "verse", start: 37.6, end: 60, canvas: "vertical" };
    expect(() => onCanvas(bad, "landscape")).toThrow(/verse/);
    const es = cutEntries([...TL, bad], { ...land, loaded: pick("intro") });
    expect(ids(es)).toEqual(["intro", "hook", "outro", "hud"]);
  });
});

describe("shutterWindow", () => {
  const len = 1 / 120;

  it("opens at the frame time when no cut is near", () => {
    expect(shutterWindow(1, len, [0, 5])).toEqual([1, 1 + len]);
    expect(shutterWindow(1, len, [0, 1, 5])).toEqual([1, 1 + len]);
  });

  it("slides back to end just before a cut inside it", () => {
    const [a, b] = shutterWindow(1, len, [0, 1.005]);
    expect(b).toBe(1.005 - EPS);
    expect(a).toBeCloseTo(1.005 - EPS - len, 12);
    expect(a).toBeLessThanOrEqual(1);
  });

  it("never slides past the previous cut, and shrinks to the frame time at worst", () => {
    expect(shutterWindow(1, len, [0.998, 1.005])[0]).toBe(0.998);
    expect(shutterWindow(1, len, [0, 1 + EPS / 2])).toEqual([1 - len, 1]);
    expect(shutterWindow(1, 0, [0])).toEqual([1, 1]);
  });

  it("holds the frame time and crosses no cut over 4000 random cases", () => {
    const r = lcg(7);
    for (let i = 0; i < 4000; i++) {
      const t = r() * 10,
        len = r() * 2 * (3.4 / 24); // up to a 720-degree shutter, 3.4 times longer, at 24 fps
      const cuts = [0];
      for (let c = 0; c < 10; c += r() * (i % 2 ? 0.05 : 1)) cuts.push(c); // half the cases cut faster than the shutter
      cuts.sort((x, y) => x - y);
      const [a, b] = shutterWindow(t, len, cuts);
      expect(a).toBeLessThanOrEqual(t);
      expect(b).toBeGreaterThanOrEqual(t);
      expect(b - a).toBeLessThanOrEqual(len + 1e-12);
      expect(crosses(a, b, cuts)).toBe(false);
    }
  });
});

describe("sample counts and times", () => {
  it("starts at the base count, raised by fast windows and longer shutters, capped at max", () => {
    expect(sampleCount(1, 1.01, 1, on, [])).toBe(8);
    expect(sampleCount(1, 1.01, 1, on, [[0.9, 1.005, 12]])).toBe(12);
    expect(sampleCount(1, 1.01, 1, on, [[0.5, 0.99, 12]])).toBe(8);
    expect(sampleCount(1, 1.01, 2, on, [])).toBe(16);
    expect(sampleCount(1, 1.01, 3.4, on, [])).toBe(24);
    expect(sampleCount(1, 1.01, 1, { ...on, max: 6 }, [])).toBe(6);
  });

  it("spreads samples over the shutter, both ends included", () => {
    const s = sampleTimes(2, 2.01, 4);
    expect(s).toHaveLength(4);
    expect(s[0]).toBe(2);
    expect(s[3]).toBe(2.01);
    expect(sampleTimes(2, 2.01, 1)).toEqual([2]);
    expect(sampleTimes(2, 2, 8)).toEqual([2]);
  });

  it("takes the longest shutter of the windows holding t", () => {
    expect(
      shutterScale(1, [
        [0, 2, 2],
        [0.5, 1.5, 3],
        [3, 4, 9],
      ]),
    ).toBe(3);
    expect(shutterScale(2.5, [[0, 2, 2]])).toBe(1);
  });
});

describe("framePlan", () => {
  const words = Array.from({ length: 30 }, (_, i) => ({ s: 0.37 + i * 0.31 }));
  const B = {
    cuts: cutList(
      [
        { start: 0, end: 4.03 },
        { start: 4.03, end: 10 },
      ],
      {
        words,
        lead: 0.05,
        extra: [7.777],
      },
    ),
    fasts: [[2, 2.5, 16]],
    shutters: [[6, 6.5, 3]],
    sharps: [[8, 8.5]],
  };

  it("renders once when off, inside E.sharp, or with no room before a cut", () => {
    expect(framePlan(1, 60, DEFAULTS, B)).toBeNull();
    expect(framePlan(8.2, 60, on, B)).toBeNull();
    expect(
      framePlan(1, 60, on, { ...none, cuts: [0, 1 + EPS / 2] }),
    ).not.toBeNull();
    expect(
      framePlan(1, 60, on, { ...none, cuts: [1, 1 + EPS / 2] }),
    ).toBeNull();
  });

  it("reuses the frame pass, crosses no cut, and repeats exactly over 600 frames", () => {
    let slid = 0;
    for (let f = 0; f < 600; f++) {
      const t = f / 60,
        p = framePlan(t, 60, on, B);
      expect(p).toEqual(framePlan(t, 60, on, B));
      if (!p) continue;
      expect(crosses(p[0], p[p.length - 1], B.cuts)).toBe(false);
      if (p[0] === t) continue;
      slid++;
      expect(p[0]).toBeLessThan(t);
    }
    expect(slid).toBeGreaterThan(5);
  });

  it("uses more samples in fast and long-shutter windows", () => {
    expect(framePlan(2.2, 60, on, B)).toHaveLength(16);
    expect(framePlan(6.2, 60, on, B)).toHaveLength(24);
    const p = framePlan(6.2, 60, on, B)!;
    expect(p[p.length - 1] - p[0]).toBeCloseTo(3 / 120, 12);
  });
});

describe("passes", () => {
  it("weighs every sample equally and reuses the frame pass when the shutter opens on it", () => {
    expect(passes([1, 1.1, 1.2], 1)).toEqual({
      n: 3,
      reuse: true,
      render: [1.1, 1.2],
    });
    expect(passes([0.9, 0.95, 1], 1)).toEqual({
      n: 3,
      reuse: false,
      render: [0.9, 0.95, 1],
    });
  });
});

describe("replayIndex", () => {
  it("returns the frame pass's index where subtracting the shift rounds to the previous clip frame", () => {
    const t = 2 / 60,
      ts = 0.03888888888888889,
      shift = ts - t;
    expect(Math.floor((ts + 1 / 30 - shift) * 30)).toBe(1); // what recomputing from the sample time gives
    expect(replayIndex([[t + 1 / 30, 2]], 0, ts + 1 / 30, shift)).toBe(2);
  });

  it("replays by call order when clip time is not song time (slow motion, a clamp)", () => {
    const t = 127 / 60,
      shift = t + 1 / 120 - t;
    // the frame pass: labels at clip time t, t / 2 and min(t, 1.2), each over 5 clip frames
    const seen: [number, number][] = [];
    for (const lt of [t, t / 2, 1.2])
      for (let k = -2; k <= 2; k++)
        seen.push([lt + k / 30, Math.floor((lt + k / 30) * 30)]);
    // the same calls in the last sample: the clamped label's first call lands exactly on a slow-motion entry
    const sample = [t + shift, (t + shift) / 2, 1.2].flatMap((lt) =>
      [-2, -1, 0, 1, 2].map((k) => lt + k / 30),
    );
    sample.forEach((lt, k) =>
      expect(replayIndex(seen, k, lt, shift)).toBe(seen[k][1]),
    );
  });

  it("matches a call the frame pass never made by clip time, else returns null", () => {
    expect(replayIndex([[1, 30]], 1, 1.004, 0.004)).toBe(30);
    expect(replayIndex([[1, 30]], 1, 1.5, 0.004)).toBeNull();
    expect(replayIndex([], 0, 1.5, 0.004)).toBeNull();
  });
});
