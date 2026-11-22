import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync(
  fileURLToPath(
    new URL(
      "../../skills/scenario-motion-loops/scripts/loop-template.html",
      import.meta.url,
    ),
  ),
  "utf8",
);

// Everything before the engine section is pure: settings, helpers, palette, the example tile and
// drawOverlay. The engine needs a real canvas, so the render suite covers it.
function loadHelpers() {
  const script = html.slice(
    html.indexOf("<script>") + "<script>".length,
    html.indexOf("</script>"),
  );
  const cut = script.indexOf("// 5. Engine");
  expect(cut).toBeGreaterThan(0);
  const g: Record<string, any> = {};
  g.window = g;
  vm.createContext(g);
  vm.runInContext(script.slice(0, cut), g);
  return g;
}

// A 2D context that records every call and property write, numbers rounded so float noise far
// below a pixel does not count as a difference.
function recorder() {
  const log: string[] = [];
  const fmt = (v: unknown) =>
    typeof v === "number" ? v.toFixed(3) : JSON.stringify(v);
  const gradient = {
    addColorStop: (...a: unknown[]) =>
      log.push(`stop(${a.map(fmt).join(",")})`),
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get:
      (_, k: string) =>
      (...a: unknown[]) => {
        log.push(`${k}(${a.map(fmt).join(",")})`);
        return k.startsWith("create") ? gradient : undefined;
      },
    set: (_, k: string, v) => {
      log.push(`${k}=${fmt(v)}`);
      return true;
    },
  });
  return { ctx, log };
}

const g = loadHelpers();
const M = g.M;

describe("helpers", () => {
  it("loops on 12 seconds", () => {
    expect(M.LOOP).toBe(12);
  });

  it("phase repeats every period and honors the offset", () => {
    for (const t of [0, 0.4, 2.9, 7.25])
      expect(M.phase(t + 3, 3)).toBeCloseTo(M.phase(t, 3), 9);
    expect(M.phase(1, 4, 1)).toBeCloseTo(0.5, 9);
  });

  it("loopNoise repeats every period", () => {
    for (const t of [0, 1.3, 5.5])
      expect(M.loopNoise(t + 12, 7)).toBeCloseTo(M.loopNoise(t, 7), 9);
    expect(M.loopNoise(1 + 3, 2, 3)).toBeCloseTo(M.loopNoise(1, 2, 3), 9);
  });

  it("rand is a pure function of index and salt", () => {
    expect(M.rand(5, 1)).toBe(M.rand(5, 1));
    expect(M.rand(5, 1)).not.toBe(M.rand(5, 2));
    for (let i = 0; i < 200; i++) {
      const r = M.rand(i, 3);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it("every ease starts at 0 and ends at 1", () => {
    for (const [name, f] of Object.entries(M.ease) as [string, Function][]) {
      expect(f(0), name).toBeCloseTo(0, 9);
      expect(f(1), name).toBeCloseTo(1, 9);
    }
  });

  it("win holds before and after its window", () => {
    expect(M.win(0.1, 0.2, 0.4)).toBe(0);
    expect(M.win(0.3, 0.2, 0.4)).toBeCloseTo(0.5, 9);
    expect(M.win(0.9, 0.2, 0.4)).toBe(1);
  });

  it("color helpers read the rgb() strings mixColor returns", () => {
    const mid = M.mixColor("#000000", "#ffffff", 0.5);
    expect(mid).toBe("rgb(128,128,128)");
    expect(M.rgba(mid, 0.5)).toBe("rgba(128,128,128,0.5)");
    expect(M.mixColor(mid, "#fff", 1)).toBe("rgb(255,255,255)");
    expect(M.hexToRgb("#5CC8FF")).toEqual([92, 200, 255]);
  });

  it("projects with one division by depth", () => {
    expect(M.proj(1, 1, 2, 100, 0, 0)).toEqual([50, -50, 50]);
  });
});

describe("palette", () => {
  it("builds the three tones from the brand colors", () => {
    const dark = g.palette("dark");
    const accent = g.palette("accent");
    const light = g.palette("light");
    expect(dark.fg).toBe(dark.accent);
    expect(accent.bg).toBe(accent.accent);
    expect(light.bg).toBe(light.paper);
    expect(light.fg2).toBe(light.accent);
    for (const P of [dark, accent, light])
      for (const k of ["bg", "fg", "fg2", "mid", "accent", "paper", "ink"])
        expect(typeof P[k], k).toBe("string");
  });
});

describe("example tile", () => {
  const tile = Object.values(g.TILES)[0] as {
    draw: (...a: unknown[]) => void;
  };
  const draw = (t: number, w = 640, h = 360, tone = "dark") => {
    const { ctx, log } = recorder();
    tile.draw(ctx, w, h, t, g.palette(tone));
    return log;
  };

  it("is registered first, so it renders by default", () => {
    expect(Object.keys(g.TILES)[0]).toBe("example.perspective-floor");
  });

  it("draws the same frame for the same time", () => {
    expect(draw(4.2)).toEqual(draw(4.2));
  });

  it("draws the frame at 12 s exactly like the frame at 0 s", () => {
    expect(draw(12)).toEqual(draw(0));
  });

  it("moves between frames", () => {
    expect(draw(1 / 24)).not.toEqual(draw(0));
  });

  it("draws at every aspect and tone", () => {
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1920],
      [1080, 1080],
    ])
      for (const tone of ["dark", "accent", "light"])
        expect(draw(3, w, h, tone).length).toBeGreaterThan(100);
  });
});

describe("drawOverlay", () => {
  const img = { width: 400, height: 600 };
  const overlay = (t: number) => {
    const { ctx, log } = recorder();
    g.drawOverlay(ctx, 1920, 1080, t, g.palette("dark"), img);
    return log;
  };

  it("closes on the loop so the composite still loops", () => {
    expect(overlay(12)).toEqual(overlay(0));
    expect(overlay(1.5)).not.toEqual(overlay(0));
  });
});
