import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdditiveBlending,
  canvases,
  CustomBlending,
  DoubleSide,
  fakeDocument,
  fakeRenderer,
  restoreGlobals,
  setGlobal,
  OneFactor,
  OneMinusSrcAlphaFactor,
} from "./core-kit-fakes.ts";
import {
  drawRotoFullscreen,
  FOOTAGE_DEFAULT,
  makeRotoMaterial,
  rotoLevels,
} from "../../skills/scenario-kinetic-music-video/assets/engine/roto.js";

// three is not installed; the stand-in records what the engine hands it
vi.mock("three", () => import("./core-kit-fakes.ts"));

beforeEach(() => {
  setGlobal("document", fakeDocument);
});
afterEach(() => {
  restoreGlobals();
});

describe("makeRotoMaterial", () => {
  it("renders keyed original footage by default, premultiplied", () => {
    expect(FOOTAGE_DEFAULT).toBe(true);
    const m = makeRotoMaterial({});
    expect(m.uniforms.uFootage.value).toBe(1);
    expect(m).toMatchObject({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    expect(m.uniforms.uKeyLo.value).toBe(0.012);
    expect(m.uniforms.uKeyHi.value).toBe(0.07);
    expect(m.uniforms.uGrid.value).toBe(140);
    expect(m.uniforms.uCrop.value).toMatchObject({ x: 0, y: 0, z: 1, w: 1 });
  });

  it("switches to additive stylized redraws only when asked", () => {
    for (const o of [{ stylized: true, footage: 1 }, { footage: 0 }]) {
      const m = makeRotoMaterial({}, { ...o, dots: 1, edges: 0.8, grid: 90 });
      expect(m.uniforms.uFootage.value).toBe(0);
      expect(m.blending).toBe(AdditiveBlending);
      expect(m.blendSrc).toBeUndefined();
      expect(m.uniforms.uDots.value).toBe(1);
      expect(m.uniforms.uEdges.value).toBe(0.8);
      expect(m.uniforms.uGrid.value).toBe(90);
    }
  });

  it("takes colors and levels from options", () => {
    const m = makeRotoMaterial(
      {},
      { colA: "#010203", lumLo: 0.1, intensity: 3 },
    );
    expect(m.uniforms.uColA.value.input).toBe("#010203");
    expect(m.uniforms.uColB.value.input).toBe("#FFB000");
    expect(m.uniforms.uLumLo.value).toBe(0.1);
    expect(m.uniforms.uLumHi.value).toBe(0.75);
    expect(m.uniforms.uIntensity.value).toBe(3);
  });

  it("shares one glyph atlas, one 64 px cell per glyph", () => {
    const before = canvases.length;
    const a = makeRotoMaterial({});
    const b = makeRotoMaterial({}, { ascii: 1 });
    expect(b.uniforms.uGlyph.value).toBe(a.uniforms.uGlyph.value);
    expect(canvases.length - before).toBeLessThanOrEqual(1);
    const atlas = a.uniforms.uGlyph.value;
    const n = a.uniforms.uGlyphN.value;
    expect(n).toBe(27);
    expect(atlas.userData.n).toBe(n);
    expect([atlas.image.width, atlas.image.height]).toEqual([64 * n, 64]);
    const glyphs = atlas.image.ctx.draws;
    expect(glyphs).toHaveLength(n);
    expect(glyphs.slice(0, 3).map((d) => [d.text, d.x])).toEqual([
      [" ", 32],
      [".", 96],
      ["·", 160],
    ]);
    expect(glyphs[0].font).toBe('700 55.04px "JetBrains Mono"');
  });
});

describe("rotoLevels", () => {
  it("maps a fraction of the clip's measured luminance window onto the material", () => {
    const m = makeRotoMaterial({});
    rotoLevels(
      m,
      { meta: { lumLo: 0.1, lumHi: 0.5, w: 1920, h: 1080 } },
      0.25,
      0.75,
    );
    expect(m.uniforms.uLumLo.value).toBeCloseTo(0.2);
    expect(m.uniforms.uLumHi.value).toBeCloseTo(0.4);
    expect(m.uniforms.uVidRes.value).toMatchObject({ x: 1920, y: 1080 });
    rotoLevels(m, { meta: { lumLo: 0.1, lumHi: 0.5, w: 1920, h: 1080 } });
    expect(m.uniforms.uLumLo.value).toBeCloseTo(0.1);
    expect(m.uniforms.uLumHi.value).toBeCloseTo(0.5);
  });

  it("keeps the levels and still sets the resolution when the clip was never measured", () => {
    const m = makeRotoMaterial({}, { lumLo: 0.3, lumHi: 0.6 });
    rotoLevels(m, { meta: { w: 640, h: 480 } }, 0.5, 0.5);
    expect(m.uniforms.uLumLo.value).toBe(0.3);
    expect(m.uniforms.uLumHi.value).toBe(0.6);
    expect(m.uniforms.uVidRes.value).toMatchObject({ x: 640, y: 480 });
  });
});

describe("drawRotoFullscreen", () => {
  const plane = (
    W: number,
    H: number,
    vw: number,
    vh: number,
    cropW = 1,
    o?: object,
  ) => {
    const E: any = { W, H, renderer: fakeRenderer() };
    const mat = makeRotoMaterial(E);
    mat.uniforms.uVidRes.value.set(vw, vh);
    mat.uniforms.uCrop.value.set(0, 0, cropW, 1);
    drawRotoFullscreen(E, mat, o);
    return { E, mat, mesh: E._rotoFS.mesh, cam: E._rotoFS.cam };
  };

  it("covers the frame, filling one axis exactly and keeping the clip's aspect", () => {
    const cases: [number, number, number, number, number][] = [
      [1920, 1080, 1280, 720, 1],
      [1080, 1920, 1280, 720, 1],
      [1080, 1920, 1280, 720, 0.25],
      [1080, 1080, 720, 1280, 1],
    ];
    for (const [W, H, vw, vh, cw] of cases) {
      const { mesh, cam } = plane(W, H, vw, vh, cw);
      const sw = cam.right - cam.left,
        sh = cam.top - cam.bottom;
      expect(cam.right).toBeCloseTo(W / H);
      expect(mesh.scale.x / mesh.scale.y).toBeCloseTo((vw * cw) / vh);
      expect(mesh.scale.x).toBeGreaterThanOrEqual(sw - 1e-9);
      expect(mesh.scale.y).toBeGreaterThanOrEqual(sh - 1e-9);
      expect(Math.min(mesh.scale.x - sw, mesh.scale.y - sh)).toBeCloseTo(0);
    }
  });

  it("scales and offsets the plane, and renders it", () => {
    const { E, mesh } = plane(1920, 1080, 1920, 1080, 1, {
      scale: 1.5,
      x: 0.2,
      y: -0.1,
    });
    expect(mesh.scale.y).toBeCloseTo(3);
    expect(mesh.scale.x).toBeCloseTo(3 * (16 / 9));
    expect(mesh.position).toMatchObject({ x: 0.2, y: -0.1, z: 0 });
    expect(E.renderer.calls).toEqual([
      ["render", E._rotoFS.scene, E._rotoFS.cam],
    ]);
  });

  it("reuses one fullscreen plane and swaps the material in", () => {
    const E: any = { W: 1920, H: 1080, renderer: fakeRenderer() };
    const a = makeRotoMaterial(E);
    const b = makeRotoMaterial(E);
    drawRotoFullscreen(E, a);
    const fs = E._rotoFS;
    drawRotoFullscreen(E, b);
    expect(E._rotoFS).toBe(fs);
    expect(fs.scene.children).toEqual([fs.mesh]);
    expect(fs.mesh.material).toBe(b);
  });
});
