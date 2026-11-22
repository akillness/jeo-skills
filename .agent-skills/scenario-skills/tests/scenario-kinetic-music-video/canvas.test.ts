import { describe, expect, it } from "vitest";
import {
  canvasTags,
  centerOnSafe,
  onCanvas,
  orientation,
  parseCanvas,
  plateFit,
  resolveCanvas,
  safeInsets,
  safeRect,
  TALL_SAFE,
} from "../../skills/scenario-kinetic-music-video/assets/engine/canvas.js";

describe("parseCanvas", () => {
  it("reads presets, WxH and [w, h]", () => {
    expect(parseCanvas("portrait")).toEqual([1080, 1920]);
    expect(parseCanvas(" Landscape ")).toEqual([1920, 1080]);
    expect(parseCanvas("square")).toEqual([1080, 1080]);
    expect(parseCanvas("1080x1350")).toEqual([1080, 1350]);
    expect(parseCanvas([720, 1280])).toEqual([720, 1280]);
  });

  it("refuses odd sides, which H.264 4:2:0 cannot encode", () => {
    expect(parseCanvas("1081x1920")).toBeNull();
    expect(parseCanvas([1080, 1921])).toBeNull();
  });

  it("refuses anything else", () => {
    for (const v of ["", "9:16", "vertical", "1080*1920", "0x0", [1080], null])
      expect(parseCanvas(v)).toBeNull();
  });
});

describe("resolveCanvas", () => {
  it("prefers the query, then timeline.js CANVAS, then landscape", () => {
    expect(resolveCanvas("portrait", "landscape")).toEqual([1080, 1920]);
    expect(resolveCanvas(null, "portrait")).toEqual([1080, 1920]);
    expect(resolveCanvas("", undefined)).toEqual([1920, 1080]);
  });

  it("throws on an unreadable value instead of falling back", () => {
    expect(() => resolveCanvas("vertical", "landscape")).toThrow(/vertical/);
    expect(() => resolveCanvas(null, "1081x1920")).toThrow(/even sides/);
  });
});

describe("safe band", () => {
  it("gives a 9:16-tall canvas the platform-UI band and wider canvases the full frame", () => {
    expect(safeInsets(1080, 1920)).toEqual(TALL_SAFE);
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1080],
      [1080, 1350],
    ])
      expect(safeInsets(w, h)).toEqual({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      });
  });

  it("applies a timeline.js SAFE override for the matching orientation only", () => {
    const SAFE = { landscape: { top: 0.1, bottom: 0.1 } };
    expect(safeInsets(1920, 1080, SAFE)).toEqual({
      top: 0.1,
      bottom: 0.1,
      left: 0,
      right: 0,
    });
    expect(safeInsets(1080, 1920, SAFE)).toEqual(TALL_SAFE);
  });

  it("keeps the default for every side a partial override leaves out", () => {
    expect(safeInsets(1080, 1920, { portrait: { top: 0.2 } })).toEqual({
      ...TALL_SAFE,
      top: 0.2,
    });
  });

  it("keeps the landscape rect exactly the canvas, so landscape layouts do not move", () => {
    expect(safeRect(1920, 1080, safeInsets(1920, 1080))).toEqual({
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
    });
    expect(safeRect(960, 540, safeInsets(960, 540))).toEqual({
      x: 0,
      y: 0,
      w: 960,
      h: 540,
    });
  });

  it("insets a portrait rect by the band", () => {
    const r = safeRect(1080, 1920, safeInsets(1080, 1920));
    expect(r).toEqual({ x: 65, y: 269, w: 875, h: 979 });
  });
});

describe("centerOnSafe", () => {
  const camera = () => {
    const calls: number[][] = [];
    return { calls, setViewOffset: (...a: number[]) => calls.push(a) };
  };

  it("leaves the camera alone on a full-frame band", () => {
    const cam = camera();
    centerOnSafe(cam, 1920, 1080, { x: 0, y: 0, w: 1920, h: 1080 });
    expect(cam.calls).toEqual([]);
  });

  it("offsets the view so the frame center lands on the band center", () => {
    const cam = camera();
    const r = { x: 65, y: 269, w: 875, h: 979 };
    centerOnSafe(cam, 1080, 1920, r);
    expect(cam.calls).toEqual([
      [1080, 1920, 540 - (65 + 875 / 2), 960 - (269 + 979 / 2), 1080, 1920],
    ]);
  });
});

describe("orientation and onCanvas", () => {
  it("names the canvas shape", () => {
    expect(orientation(1920, 1080)).toBe("landscape");
    expect(orientation(1080, 1920)).toBe("portrait");
    expect(orientation(1080, 1080)).toBe("square");
  });

  it("renders untagged entries everywhere and tagged ones on their canvas only", () => {
    expect(onCanvas({ id: "hud" }, "portrait")).toBe(true);
    expect(onCanvas({ id: "a", canvas: "portrait" }, "portrait")).toBe(true);
    expect(onCanvas({ id: "a", canvas: "portrait" }, "landscape")).toBe(false);
    expect(
      onCanvas({ id: "a", canvas: ["portrait", "square"] }, "square"),
    ).toBe(true);
    expect(onCanvas({ id: "a", canvas: " Portrait " }, "portrait")).toBe(true);
  });

  it("throws on a tag it cannot read instead of dropping the section", () => {
    expect(canvasTags({ id: "a" })).toBeNull();
    for (const canvas of ["vertical", "9:16", ["portrait", "tall"]])
      expect(() => canvasTags({ id: "hook_v", canvas })).toThrow(/hook_v/);
  });
});

describe("plateFit", () => {
  const clip = (w: number, h: number) => ({ meta: { w, h } });
  it("fills the frame when the clip's shape matches the canvas", () => {
    expect(plateFit({ W: 1920, H: 1080 }, clip(1280, 720))).toBe("cover");
    expect(plateFit({ W: 540, H: 960 }, clip(720, 1280))).toBe("cover");
  });

  it("windows a clip whose shape is far from the canvas", () => {
    expect(plateFit({ W: 1080, H: 1920 }, clip(1920, 1080))).toBe("contain");
    expect(plateFit({ W: 1080, H: 1080 }, clip(1920, 1080))).toBe("contain");
    expect(plateFit({ W: 1920, H: 1080 }, clip(720, 1280))).toBe("contain");
  });
});
