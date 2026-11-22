import { describe, expect, it, vi } from "vitest";
import {
  plateRect,
  plateToScreen,
} from "../../skills/scenario-kinetic-music-video/assets/engine/plate.js";

// plate.js imports three for drawing; the layout math under test never touches it
vi.mock("three", () => ({}));

const E = { W: 1080, H: 1920, SCALE: 1 };
const clip = { meta: { w: 1920, h: 1080 } };

describe("plateRect", () => {
  it("keeps the clip's shape without a crop", () => {
    const r = plateRect(E, clip, { fit: "contain" });
    expect(r.w).toBe(1080);
    expect(r.h).toBeCloseTo(607.5);
  });

  it("sizes a cropped plate by the crop's shape, never stretching it", () => {
    const r = plateRect(E, clip, { fit: "contain", crop: [0.25, 0, 0.5, 1] });
    expect(r.w / r.h).toBeCloseTo(960 / 1080);
  });
});

describe("plateToScreen", () => {
  const crop = [0.25, 0.1, 0.5, 0.8];

  it("maps the crop's corners onto the plate's corners", () => {
    const o = { fit: "contain", crop };
    const r = plateRect(E, clip, o);
    const tl = plateToScreen(E, clip, [0.25, 0.1], o);
    const br = plateToScreen(E, clip, [0.75, 0.9], o);
    expect(tl[0]).toBeCloseTo(r.x);
    expect(tl[1]).toBeCloseTo(r.y);
    expect(br[0]).toBeCloseTo(r.x + r.w);
    expect(br[1]).toBeCloseTo(r.y + r.h);
  });

  it("mirrors within the crop", () => {
    const o = { fit: "contain", crop, mirror: true };
    const r = plateRect(E, clip, o);
    const p = plateToScreen(E, clip, [0.25, 0.1], o);
    expect(p[0]).toBeCloseTo(r.x + r.w);
    expect(p[1]).toBeCloseTo(r.y);
  });

  it("maps the clip's center to the plate's center without a crop", () => {
    const r = plateRect(E, clip, {});
    const p = plateToScreen(E, clip, [0.5, 0.5], {});
    expect(p[0]).toBeCloseTo(r.cx);
    expect(p[1]).toBeCloseTo(r.cy);
  });
});
