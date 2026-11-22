import { beforeEach, describe, expect, it, vi } from "vitest";

// core.js and plate.js import three for textures and materials; these tests only reach the clip and tracking logic
vi.mock("three", () => ({
  Texture: class {
    image = null;
  },
  ShaderMaterial: class {
    uniforms: unknown;
    constructor(o: { uniforms: unknown }) {
      this.uniforms = o.uniforms;
    }
  },
  Vector4: class {
    set() {
      return this;
    }
  },
  Scene: class {
    children: unknown[] = [];
    add(m: unknown) {
      this.children.push(m);
    }
  },
  OrthographicCamera: class {
    updateProjectionMatrix() {}
  },
  PlaneGeometry: class {},
  Mesh: class {
    material: unknown;
    scale = { set() {} };
    position = { set() {} };
    rotation = { z: 0 };
    constructor(_g: unknown, m: unknown) {
      this.material = m;
    }
  },
  DoubleSide: 2,
  CustomBlending: 5,
  OneFactor: 201,
  OneMinusSrcAlphaFactor: 205,
  LinearFilter: 1,
  SRGBColorSpace: "srgb",
  NoColorSpace: "",
}));
vi.mock("three/addons/loaders/TTFLoader.js", () => ({ TTFLoader: class {} }));
vi.mock("three/addons/loaders/FontLoader.js", () => ({ Font: class {} }));
vi.mock("three/addons/geometries/TextGeometry.js", () => ({
  TextGeometry: class {},
}));

const { loadVideo, trackFrame } =
  await import("../../skills/scenario-kinetic-music-video/assets/engine/core.js");
const { clock } =
  await import("../../skills/scenario-kinetic-music-video/assets/engine/blur.js");
const { drawPlate, plateMaterialFor } =
  await import("../../skills/scenario-kinetic-music-video/assets/engine/plate.js");

const track = Array.from({ length: 100 }, (_, i) => ({ i }));
globalThis.fetch = (async (u: string) => ({
  json: async () =>
    u.endsWith("meta.json") ? { fps: 30, n: 100, track: true } : track,
  blob: async () => ({}),
})) as unknown as typeof fetch;
globalThis.createImageBitmap = (async () => ({})) as typeof createImageBitmap;

let n = 0;
const clip = async () => loadVideo(`clip_${n++}`);
const idx = (r: { i: number } | null) => r?.i;
// one output frame as main.js runs it: prepare() (no layer), the frame pass, then samples at t + shift that re-render
// only the blurred layers; at(i) marks layer i's render()
function frame(keep: boolean) {
  clock.id++;
  trackFrame(keep);
  clock.pass++;
}
function sample(shift: number) {
  clock.pass++;
  clock.sub = true;
  clock.shift = shift;
}
const at = (i: number | null) => (clock.layer = i);

beforeEach(() => {
  clock.sub = false;
  clock.shift = 0;
  clock.stale = null;
  trackFrame(false);
});

describe("trackAt", () => {
  it("is unchanged without blur, and records nothing", async () => {
    const v = await clip();
    frame(false);
    at(0);
    expect(idx(v.trackAt(2 / 60 + 1 / 30))).toBe(2);
    expect(idx(v.trackAt(1.999))).toBe(59);
    expect(v._seen).toBeUndefined();
  });

  it("returns the frame pass's landmarks inside a sample", async () => {
    const v = await clip();
    const t = 0.33; // clip frame 9, and the sample below reaches clip frame 10
    frame(true);
    at(0);
    expect(idx(v.trackAt(t))).toBe(9);
    sample(0.008);
    expect(idx(v.trackAt(t + 0.008))).toBe(9);
  });

  it("replays slow motion by call order, sample after sample", async () => {
    const v = await clip();
    const t = 1.33; // clip time t / 2 sits just before clip frame 20
    frame(true);
    at(0);
    const want = [-1, 0, 1].map((k) => idx(v.trackAt(t / 2 + k / 30)));
    for (const s of [0.004, 0.008]) {
      sample(s);
      expect(
        [-1, 0, 1].map((k) => idx(v.trackAt((t + s) / 2 + k / 30))),
      ).toEqual(want);
    }
  });

  it("forgets the last frame's calls at the next frame pass", async () => {
    const v = await clip();
    frame(true);
    at(0);
    v.trackAt(1);
    expect(v._seen.get(0)).toHaveLength(1);
    clock.sub = false;
    frame(false);
    expect(v._seen).toBeNull();
    at(0);
    sample(0.004);
    expect(idx(v.trackAt(1.5))).toBe(45); // nothing recorded: computed from the time given
  });

  // t = 0.66 at half speed: clip frame 9 on the frame pass, 10 when computed at the sample time
  const t = 0.66,
    s = 0.008;

  it("ignores a sharp layer's calls, which no sample repeats", async () => {
    const v = await clip();
    frame(true);
    at(0);
    v.trackAt(1); // a blur: false layer below the blurred one
    at(1);
    expect(idx(v.trackAt(t / 2))).toBe(9);
    sample(s); // layer 0 is sharp, so only layer 1 renders again
    at(1);
    expect(idx(v.trackAt((t + s) / 2))).toBe(9);
  });

  it("ignores calls from prepare(), which samples never run", async () => {
    const v = await clip();
    frame(true);
    v.trackAt(1); // prepare(), before any layer renders
    at(0);
    expect(idx(v.trackAt(t / 2))).toBe(9);
    sample(s);
    at(0);
    expect(idx(v.trackAt((t + s) / 2))).toBe(9);
  });

  it("keeps each blurred layer on its own calls when another calls more often in a sample", async () => {
    const v = await clip();
    frame(true);
    at(0);
    v.trackAt(0.2);
    at(1);
    expect(idx(v.trackAt(t / 2))).toBe(9);
    sample(s);
    at(0);
    v.trackAt(0.2 + s);
    v.trackAt(0.5); // a call the frame pass never made
    at(1);
    expect(idx(v.trackAt((t + s) / 2))).toBe(9);
  });
});

describe("stale clips", () => {
  it("flags a moving clip a sample draws without prepare() advancing it this frame", async () => {
    const a = await clip(),
      b = await clip();
    frame(true);
    await a.frame(1);
    const ma = plateMaterialFor(a),
      mb = plateMaterialFor(b);
    ma.onBeforeRender();
    mb.onBeforeRender();
    expect(clock.stale).toBeNull(); // the frame pass is never checked
    sample(0.004);
    ma.onBeforeRender();
    expect(clock.stale).toBeNull();
    mb.onBeforeRender();
    expect(clock.stale).toBe(b.name);
  });

  it("flags a clip drawPlate draws in a sample without prepare() advancing it", async () => {
    const a = await clip(),
      b = await clip();
    for (const v of [a, b]) Object.assign(v.meta, { w: 64, h: 36 });
    const E = { W: 64, H: 36, SCALE: 1, frame: 1, pass: 0 };
    const drawn: unknown[] = [];
    Object.assign(E, { renderer: { render: (sc: unknown) => drawn.push(sc) } });
    frame(true);
    await a.frame(1);
    drawPlate(E, a);
    drawPlate(E, b);
    expect(drawn).toHaveLength(2);
    expect(clock.stale).toBeNull(); // the frame pass is never checked
    sample(0.004);
    E.pass = 1;
    drawPlate(E, a);
    expect(clock.stale).toBeNull();
    drawPlate(E, b);
    expect(clock.stale).toBe(b.name);
  });

  it("never flags a one-frame still", async () => {
    const v = await clip();
    v.meta.n = 1;
    frame(true);
    sample(0.004);
    plateMaterialFor(v).onBeforeRender();
    expect(clock.stale).toBeNull();
  });
});
