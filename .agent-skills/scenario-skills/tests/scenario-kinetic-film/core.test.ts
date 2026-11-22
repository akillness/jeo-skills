import { describe, expect, it, vi } from "vitest";
import {
  B,
  configure,
  DUR,
  E,
  env,
  FPS,
  mixc,
  rgba,
  rng,
  tw,
} from "../../skills/scenario-kinetic-film/assets/engine/core.js";

describe("configure", () => {
  it("sets the film length from beats and tempo", () => {
    configure({ bpm: 172, beats: 68, fps: 60 });
    expect(DUR).toBeCloseTo((68 * 60) / 172, 10);
    expect(B(68)).toBeCloseTo(DUR, 10);
    expect(B(1)).toBeCloseTo(60 / 172, 10);
    expect(FPS).toBe(60);
  });
});

describe("eases and tweens", () => {
  it("every ease maps 0 to 0 and 1 to 1", () => {
    for (const [name, f] of Object.entries(E)) {
      expect(f(0), name).toBeCloseTo(0, 9);
      expect(f(1), name).toBeCloseTo(1, 9);
    }
  });

  it("tw clamps outside its span", () => {
    expect(tw(-1, 0, 1)).toBe(0);
    expect(tw(2, 0, 1)).toBe(1);
    expect(tw(0.5, 0, 1, E.lin)).toBe(0.5);
  });

  it("env rises, holds and falls", () => {
    expect(env(0, 0, 1)).toBe(0);
    expect(env(0.5, 0, 1)).toBe(1);
    expect(env(1, 0, 1)).toBe(0);
    expect(env(0.05, 0, 1)).toBeGreaterThan(0);
    expect(env(0.05, 0, 1)).toBeLessThan(1);
  });
});

describe("rng", () => {
  it("is seeded, and stays in [0, 1)", () => {
    const a = rng(7),
      b = rng(7),
      c = rng(8);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe("colors", () => {
  it("mixes 6-digit hex and rgb()", () => {
    expect(mixc("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixc("rgb(0, 0, 0)", "#FF0000", 1)).toBe("#ff0000");
    expect(rgba("#FF8000", 0.5)).toBe("rgba(255,128,0,0.5)");
  });

  it("normalizes any other CSS color through a canvas, so a shot color may be a name", () => {
    // a canvas reads back an opaque color as #rrggbb and keeps the last valid one
    const known: Record<string, string> = {
      "#000": "#000000",
      white: "#ffffff",
      "#fff": "#ffffff",
    };
    let style = "#000000";
    const ctx = {
      get fillStyle() {
        return style;
      },
      set fillStyle(v: string) {
        style = known[v] ?? style;
      },
    };
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => ctx }),
    });
    try {
      expect(rgba("white", 0.5)).toBe("rgba(255,255,255,0.5)");
      expect(mixc("#fff", "#000000", 0.5)).toBe("#808080");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
