import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetState,
  restoreGlobals,
  setGlobal,
  state,
  three,
} from "./engine-fakes";

// main.js boots a WebGL page: three, its addons and the browser globals are fakes that
// record what reached them, while the engine's canvas, layer, blur and post logic runs for
// real. The GPU features main.js probes come from a per-boot setting on globalThis, since
// vi.resetModules hands every mock factory a fresh module scope.
vi.mock("three", async () => {
  const { three } = await import("./engine-fakes");
  const gpu = () =>
    (globalThis as any)[Symbol.for("kinetic-engine-main-gpu")] as Gpu;
  class WebGLRenderer extends three.WebGLRenderer {
    extensions = {
      has: (name: string) =>
        name === "EXT_color_buffer_float" && gpu().colorBufferFloat,
    };
    getContext() {
      return {
        getExtension: (name: string) =>
          name === "EXT_float_blend" && gpu().floatBlend ? {} : null,
      };
    }
  }
  return {
    ...three,
    FloatType: "FloatType",
    NoBlending: "NoBlending",
    WebGLRenderer,
  };
});
vi.mock("three/addons/postprocessing/EffectComposer.js", async () => ({
  EffectComposer: (await import("./engine-fakes")).addons.EffectComposer,
}));
vi.mock("three/addons/postprocessing/TexturePass.js", async () => ({
  TexturePass: (await import("./engine-fakes")).addons.TexturePass,
}));
vi.mock("three/addons/postprocessing/UnrealBloomPass.js", async () => {
  const { addons } = await import("./engine-fakes");
  const gpu = () =>
    (globalThis as any)[Symbol.for("kinetic-engine-main-gpu")] as Gpu;
  return {
    UnrealBloomPass: class extends addons.UnrealBloomPass {
      sizes: number[][] = [];
      materialHighPassFilter = gpu().highPass && {
        uniforms: Object.fromEntries(
          gpu().highPass!.map((k) => [k, { value: null }]),
        ),
      };
      setSize(w: number, h: number) {
        this.sizes.push([w, h]);
      }
    },
  };
});
vi.mock("three/addons/postprocessing/ShaderPass.js", async () => {
  const { addons } = await import("./engine-fakes");
  return {
    ShaderPass: class extends addons.ShaderPass {
      shader: Record<string, unknown>;
      constructor(shader: any) {
        super(shader);
        this.shader = shader;
      }
    },
  };
});
vi.mock("three/addons/loaders/TTFLoader.js", async () => ({
  TTFLoader: (await import("./engine-fakes")).addons.TTFLoader,
}));
vi.mock("three/addons/loaders/FontLoader.js", async () => ({
  Font: (await import("./engine-fakes")).addons.Font,
}));
vi.mock("three/addons/geometries/TextGeometry.js", () => ({
  TextGeometry: class {},
}));

// The project's timeline.js only exists once a project is scaffolded. vitest keys a
// module it cannot resolve by its raw specifier, so the mock uses main.js's own.
const TIMELINE_ID = "./timeline.js";
const MAIN = "../../skills/scenario-kinetic-music-video/assets/engine/main.js";

const AUDIO = {
  duration: 4,
  bpm: 120,
  env_fps: 60,
  env: { mix: [0, 1, 0] },
  beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  downbeats: [0, 2],
  kicks: [0, 1],
};
const LYRICS = { lines: [] };
// a tracked clip whose pose index is its frame number at 1000 fps, so each sample time reads a different point
const CLIP = {
  "/assets/video/dance/meta.json": { n: 9000, fps: 1000, track: true },
  "/assets/video/dance/track.json": Array.from(
    { length: 9000 },
    (_, i) => `p${i}`,
  ),
};

type Scene = {
  load?: (E: Engine, l: Layer) => unknown;
  prepare?: (E: Engine, t: number, l: Layer) => unknown;
  render: (E: Engine, t: number, rt: unknown, l: Layer) => unknown;
  blur?: unknown;
};
type Layer = {
  id: string;
  scene: Scene;
  loaded: boolean;
  [k: string]: unknown;
};
type Engine = Record<string, any>;
type Gpu = {
  colorBufferFloat: boolean;
  floatBlend: boolean;
  highPass: string[] | null;
};
// the uniforms UnrealBloomPass feeds its bright pass, which the 4K fix relies on
const FED = [
  "tDiffuse",
  "luminosityThreshold",
  "smoothWidth",
  "defaultColor",
  "defaultOpacity",
];
type Page = {
  win: Record<string, any>;
  E: Engine;
  canvas: Record<string, any>;
  fetched: string[];
  fontLoads: string[];
  frameCallbacks: (() => unknown)[];
  errors: unknown[];
};

const scene = (log: string[] = [], name = "", op?: unknown): Scene => ({
  load: vi.fn(),
  prepare: (_E, t) => log.push(`prepare:${name}@${t}`),
  render: (_E, t) => {
    log.push(`render:${name}@${t}`);
    return op;
  },
});

async function boot({
  search = "",
  timeline = {},
  scenes = {},
  gpu = {},
}: {
  search?: string;
  timeline?: Record<string, unknown>;
  scenes?: Record<string, Scene>;
  gpu?: Partial<Gpu>;
} = {}): Promise<Page> {
  vi.resetModules();
  resetState();
  setGlobal(Symbol.for("kinetic-engine-main-gpu") as unknown as string, {
    colorBufferFloat: true,
    floatBlend: true,
    highPass: FED,
    ...gpu,
  });
  const win: Record<string, any> = {};
  const fetched: string[] = [];
  const fontLoads: string[] = [];
  const frameCallbacks: (() => unknown)[] = [];
  const errors: unknown[] = [];
  const canvas: Record<string, any> = {
    width: 0,
    height: 0,
    style: {},
    toBlob(cb: (b: Blob) => void, type: string, q: number) {
      canvas.blobArgs = [type, q];
      cb(new Blob([new Uint8Array([7, 8, 9])]));
    },
  };
  setGlobal("window", win);
  setGlobal("location", { search });
  setGlobal("document", {
    getElementById: (id: string) => (id === "c" ? canvas : null),
    fonts: {
      load: async (f: string) => fontLoads.push(f),
      ready: Promise.resolve(),
    },
  });
  setGlobal("fetch", async (url: string) => {
    fetched.push(url);
    return {
      json: async () =>
        url in CLIP
          ? CLIP[url as keyof typeof CLIP]
          : url.endsWith("audio.json")
            ? AUDIO
            : LYRICS,
      blob: async () => ({ url }),
    };
  });
  setGlobal("createImageBitmap", async (b: { url: string }) => b);
  setGlobal("requestAnimationFrame", (cb: () => unknown) =>
    frameCallbacks.push(cb),
  );
  vi.spyOn(console, "error").mockImplementation((e) => errors.push(e));
  vi.doMock(TIMELINE_ID, () => ({
    CANVAS: undefined,
    SAFE: undefined,
    POST: undefined,
    HUD: undefined,
    BLUR: undefined,
    TIMELINE: [],
    ...timeline,
  }));
  for (const [file, s] of Object.entries(scenes))
    vi.doMock(`/engine/scenes/${file}`, () => ({ default: s }));
  await import(MAIN);
  await vi.waitFor(() => {
    if (!win.__ready && !win.__error) throw new Error("still booting");
  });
  return { win, E: win.E, canvas, fetched, fontLoads, frameCallbacks, errors };
}

const finalUniforms = () =>
  state.composers[0].passes[2].uniforms as Record<string, { value: any }>;
const bloom = () => state.composers[0].passes[1] as Record<string, number>;

afterEach(() => {
  restoreGlobals();
  vi.restoreAllMocks();
});

describe("canvas", () => {
  it("scales the canvas and rounds each side to an even number", async () => {
    const { E, canvas } = await boot({ search: "?canvas=1080x1350&scale=0.5" });
    expect([canvas.width, canvas.height]).toEqual([540, 676]);
    expect(canvas.style).toEqual({ width: "540px", height: "676px" });
    expect([E.W, E.H, E.SCALE]).toEqual([540, 676, 0.5]);
    expect(E.CANVAS).toEqual([1080, 1350]);
    expect(E.ORIENT).toBe("portrait");
    expect(state.renderers[0].calls).toContainEqual([
      "setSize",
      540,
      676,
      false,
    ]);
    expect(state.composers[0].size).toEqual([540, 676]);
  });

  it("takes the canvas and safe band from timeline.js when the query names none", async () => {
    const { E } = await boot({
      timeline: { CANVAS: "portrait", SAFE: { portrait: { top: 0.2 } } },
    });
    expect([E.W, E.H]).toEqual([1080, 1920]);
    expect(E.SAFE).toEqual({ x: 65, y: 384, w: 875, h: 864 });
  });

  it("orients from the canvas, not the scaled size", async () => {
    // 2x2 rounds to an even square at this scale, but the canvas is still landscape
    const { E } = await boot({ search: "?canvas=1920x1080&scale=0.0001" });
    expect([E.W, E.H]).toEqual([2, 2]);
    expect(E.ORIENT).toBe("landscape");
  });

  it("reports an unreadable canvas through window.__error and refuses to render", async () => {
    const { win, canvas, errors } = await boot({ search: "?canvas=vertical" });
    expect(win.__error).toMatch(/vertical/);
    expect(win.__ready).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(canvas.width).toBe(1920);
    await expect(win.renderFrame(0)).rejects.toThrow(/vertical/);
  });

  it("centers a camera on the safe band only when the band is inset", async () => {
    const portrait = await boot({ search: "?canvas=portrait&safe" });
    const cam = new three.PerspectiveCamera();
    expect(portrait.E.safeCamera(cam)).toBe(cam);
    expect(cam.viewOffset).toEqual([
      1080,
      1920,
      540 - (65 + 875 / 2),
      960 - (269 + 979 / 2),
      1080,
      1920,
    ]);
    expect(portrait.E.debugSafe).toBe(true);

    const landscape = await boot();
    const flat = new three.PerspectiveCamera();
    landscape.E.safeCamera(flat);
    expect(flat.viewOffset).toBeNull();
    expect(landscape.E.debugSafe).toBe(false);
  });
});

describe("boot", () => {
  it("loads the song, the fonts and every scene before it reports ready", async () => {
    const hud = scene();
    const { win, E, fetched, fontLoads } = await boot({
      timeline: { TIMELINE: [{ id: "hud", start: 0, end: 99, z: 100 }] },
      scenes: { "hud.js": hud },
    });
    expect(win.__ready).toBe(true);
    expect(win.__error).toBeUndefined();
    expect(fetched).toEqual([
      "/engine/data/audio.json",
      "/engine/data/lyrics.json",
    ]);
    expect(E.dur).toBe(4);
    expect(E.bpm).toBe(120);
    expect(E.beat(2.25).bar).toBe(1);
    expect(fontLoads).toHaveLength(9);
    expect(fontLoads).toContain('400 100px "JetBrains Mono"');
    expect(state.fontUrls).toEqual([
      "/assets/fonts/ArchivoBlack.ttf",
      "/assets/fonts/Anton.ttf",
      "/assets/fonts/BlackHanSans.ttf",
    ]);
    expect(E.layers).toHaveLength(1);
    expect(hud.load).toHaveBeenCalledWith(E, E.layers[0]);
    expect(E.layers[0]).toMatchObject({
      id: "hud",
      z: 100,
      loaded: true,
      sharp: false,
    });
    // motion blur is off unless the project or the query turns it on
    expect(E.blur).toEqual({
      on: false,
      samples: 8,
      shutter: 180,
      max: 24,
      beatCuts: false,
      wordCuts: true,
    });
  });

  const TIMELINE = [
    { id: "a", start: 0, end: 2 },
    { id: "a_v", start: 0, end: 2, canvas: "portrait" },
    { id: "end", file: "end_a.js", start: 2, end: 4, variant: "a" },
    { id: "end_b", start: 2, end: 4, variant: "b" },
    { id: "hud", start: 0, end: 99, z: 100 },
  ];
  const files = ["a.js", "a_v.js", "end_a.js", "end_b.js", "hud.js"];
  const scenes = () =>
    Object.fromEntries(files.map((f) => [f, { render: () => 1 }]));
  const ids = (p: Page) => p.E.layers.map((l: Layer) => l.id);

  it.each([
    ["", ["a", "end", "hud"]],
    ["?variant=b", ["a", "end_b", "hud"]],
    ["?ending=b", ["a", "end_b", "hud"]],
    ["?canvas=portrait", ["a", "a_v", "end", "hud"]],
    ["?only=end,end_b", ["end", "end_b"]],
    ["?only=a,a_v", ["a"]],
  ])("picks the layers for %j", async (search, expected) => {
    const page = await boot({
      search,
      timeline: { TIMELINE },
      scenes: scenes(),
    });
    expect(page.win.__error).toBeUndefined();
    expect(ids(page)).toEqual(expected);
  });

  it("loads a layer's scene from its file when it names one", async () => {
    const s = scenes();
    const page = await boot({ timeline: { TIMELINE }, scenes: s });
    const end = page.E.layers.find((l: Layer) => l.id === "end");
    expect(end.scene).toBe(s["end_a.js"]);
  });

  it("reports a thrown value that carries no stack as it is", async () => {
    const { win } = await boot({
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }] },
      scenes: {
        "x.js": {
          load: () => {
            throw "no clip";
          },
          render: () => 1,
        },
      },
    });
    expect(win.__error).toBe("no clip");
  });

  it("fails an --only that leaves nothing on this canvas", async () => {
    const page = await boot({
      search: "?only=a_v",
      timeline: { TIMELINE },
      scenes: scenes(),
    });
    expect(page.win.__error).toContain(
      "--only a_v: nothing renders on the landscape canvas",
    );
    expect(page.win.__ready).toBeUndefined();
  });
});

describe("renderTime", () => {
  const twoLayers = (log: string[], back: Partial<Scene> = {}) => ({
    timeline: {
      TIMELINE: [
        { id: "front", start: 1, end: 3, z: 5 },
        { id: "back", start: 0, end: 2, z: 0, blend: "add" },
      ],
    },
    scenes: {
      "front.js": scene(log, "front"),
      "back.js": { ...scene(log, "back", 0.5), ...back },
    },
  });

  it("prepares every active layer, then composites them from back to front", async () => {
    const log: string[] = [];
    const { win, E } = await boot(twoLayers(log));
    const r = state.renderers[0];
    await win.renderTime(1.5);
    expect(log).toEqual([
      "prepare:back@1.5",
      "prepare:front@1.5",
      "render:back@1.5",
      "render:front@1.5",
    ]);
    expect([E.t, E.frameT, E.pass, E.frame]).toEqual([1.5, 1.5, 0, 90]);
    expect(E.atFrame(1.4)).toBe(1.4);
    const [back, front] = r.composites;
    expect(r.composites).toHaveLength(2);
    expect(back).toMatchObject({
      opacity: 0.5,
      blendSrc: "OneFactor",
      blendDst: "OneFactor",
    });
    expect(front).toMatchObject({
      opacity: 1,
      blendSrc: "OneFactor",
      blendDst: "OneMinusSrcAlphaFactor",
    });
    expect(back.target).toBe(front.target);
    expect((back.tex as any).target).not.toBe((front.tex as any).target);
    expect(r.calls).toContainEqual(["setClearColor", 0, 1]);
    expect(state.composers[0].renders).toBe(1);
  });

  it("renders a layer from its start up to, not including, its end", async () => {
    const log: string[] = [];
    const { win } = await boot(twoLayers(log));
    await win.renderTime(0.5);
    await win.renderTime(2);
    expect(log.filter((l) => l.startsWith("render"))).toEqual([
      "render:back@0.5",
      "render:front@2",
    ]);
  });

  it("hands each layer its own target and composites what it drew there", async () => {
    const targets: unknown[] = [];
    const log: string[] = [];
    const { win } = await boot(
      twoLayers(log, { render: (_E, _t, rt) => void targets.push(rt) }),
    );
    await win.renderTime(1.5);
    const [back] = state.renderers[0].composites;
    expect((back.tex as any).target).toBe(targets[0]);
    // a scene that returns no number composites at full opacity
    expect(back.opacity).toBe(1);
  });

  it("keeps timeline order among layers at the same z, which defaults to 0", async () => {
    const log: string[] = [];
    const { win } = await boot({
      timeline: {
        TIMELINE: [
          { id: "a", start: 0, end: 9 },
          { id: "b", start: 0, end: 9, z: -1 },
          { id: "c", start: 0, end: 9 },
        ],
      },
      scenes: {
        "a.js": scene(log, "a"),
        "b.js": scene(log, "b"),
        "c.js": scene(log, "c"),
      },
    });
    await win.renderTime(1);
    expect(log.filter((l) => l.startsWith("render"))).toEqual([
      "render:b@1",
      "render:a@1",
      "render:c@1",
    ]);
  });

  it.each([
    ["screen", "OneFactor", "OneMinusSrcColorFactor"],
    ["multiply", "DstColorFactor", "ZeroFactor"],
    ["normal", "OneFactor", "OneMinusSrcAlphaFactor"],
  ])("blends a %s layer", async (blend, src, dst) => {
    const { win } = await boot({
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9, blend }] },
      scenes: { "x.js": { render: () => 1 } },
    });
    await win.renderTime(1);
    expect(state.renderers[0].composites[0]).toMatchObject({
      blendSrc: src,
      blendDst: dst,
    });
  });
});

describe("post", () => {
  const withScene = (render: Scene["render"], timeline = {}) =>
    boot({
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }], ...timeline },
      scenes: { "x.js": { render } },
    });

  it("maps a scene's post settings onto the final pass for that frame only", async () => {
    let frame = 0;
    const seen: unknown[] = [];
    const { win } = await withScene((E) => {
      seen.push([E.post.grade, E.post.tint[0], E.hud.alpha]);
      if (frame++ > 0) return;
      Object.assign(E.post, {
        bloom: 1.2,
        flash: 0.01,
        grade: "warm",
        invertCol: "#00FF00",
        shake: [0.01, -0.02],
        fade: 0.5,
      });
      E.post.tint[0] = 0.25;
      E.hud.alpha = 0;
    });
    await win.renderTime(1);
    const U = finalUniforms();
    expect(bloom().strength).toBe(1.2);
    expect(U.uFlash.value).toBe(0);
    expect(U.uWarm.value).toBe(1);
    expect(U.uAmber.value.value).toBe("#00FF00");
    expect([U.uShake.value.x, U.uShake.value.y]).toEqual([0.01, -0.02]);
    expect(U.uTint.value.x).toBe(0.25);
    expect(U.uFade.value).toBe(0.5);

    await win.renderTime(2);
    expect(seen[1]).toEqual(["neutral", 1, 1]);
    expect(bloom().strength).toBe(0.55);
    expect(U.uWarm.value).toBe(0);
    expect(U.uTint.value.x).toBe(1);
    expect(U.uFade.value).toBe(1);
  });

  it("passes a flash through once it clears the threshold", async () => {
    const { win } = await withScene((E) => {
      E.post.flash = 0.5;
      E.post.flashCol = [1, 0, 0];
    });
    await win.renderTime(1);
    const U = finalUniforms();
    expect(U.uFlash.value).toBe(0.5);
    expect([U.uFlashCol.value.r, U.uFlashCol.value.g]).toEqual([1, 0]);
  });

  it("starts every frame from timeline.js POST merged over the neutral defaults", async () => {
    const { win } = await withScene(() => 1, {
      POST: { grain: 0.04, grade: "warm" },
    });
    await win.renderTime(1);
    const U = finalUniforms();
    expect(U.uGrain.value).toBe(0.04);
    expect(U.uWarm.value).toBe(1);
    expect(U.uVig.value).toBe(0);
    expect(bloom().threshold).toBe(1.05);
  });
});

describe("page API", () => {
  const one = {
    timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }] },
    scenes: { "x.js": { render: () => 1 } },
  };

  it("renders a frame index at the requested fps and keeps that fps", async () => {
    const { win, E } = await boot(one);
    expect(await win.renderFrame(45, 30)).toBe(true);
    expect([E.fps, E.t, E.frame]).toEqual([30, 1.5, 45]);
    expect(finalUniforms().uFrame.value).toBe(45);
    await win.renderTime(2);
    expect(E.frame).toBe(60);
  });

  it("grabs the canvas as encoded bytes", async () => {
    const { win, canvas } = await boot(one);
    expect(Array.from(await win.grab())).toEqual([7, 8, 9]);
    expect(canvas.blobArgs).toEqual(["image/jpeg", 0.93]);
    await win.grab("image/png", 1);
    expect(canvas.blobArgs).toEqual(["image/png", 1]);
  });

  it("renders the ?t still once booted", async () => {
    const { E } = await boot({ ...one, search: "?t=1.25" });
    await vi.waitFor(() => expect(state.composers[0].renders).toBe(1));
    expect(E.t).toBe(1.25);
  });

  it("plays from ?play in real time, one frame per animation frame", async () => {
    // a settable clock, since the test runner may read performance.now too
    let clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const { E, frameCallbacks } = await boot({ ...one, search: "?play=2" });
    await vi.waitFor(() => expect(frameCallbacks).toHaveLength(1));
    expect(E.t).toBe(2);
    clock = 1500;
    await frameCallbacks[0]();
    await vi.waitFor(() => expect(frameCallbacks).toHaveLength(2));
    expect(E.t).toBe(2.5);
  });
});

describe("4K master", () => {
  const finalShader = () =>
    (state.composers[0].passes[2] as any).shader.fragmentShader as string;

  it("runs the bloom at the scale-1 size and averages its bright pass over each cell", async () => {
    const { win, E } = await boot({ search: "?scale=2" });
    expect(win.__ready).toBe(true);
    expect([E.W, E.H]).toEqual([3840, 2160]);
    const b = bloom() as any;
    b.setSize(3840, 2160);
    expect(b.sizes).toEqual([[1920, 1080]]);
    const hp = b.materialHighPassFilter;
    expect(hp.needsUpdate).toBe(true);
    expect(hp.vertexShader).toContain(
      "gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    );
    expect(hp.fragmentShader).toContain(
      "vec2 o = 1.0000 / vec2(textureSize(tDiffuse, 0));",
    );
    // grain and scanlines keep their scale-1 cells
    expect(finalShader()).toContain(
      "h((floor(gl_FragCoord.xy / 2.0000) + 0.5) + fract(uFrame*0.61803)*100.)",
    );
    expect(finalShader()).toContain(
      "sin((floor(gl_FragCoord.y / 2.0000) + 0.5)*3.14159*0.5)",
    );
  });

  it("leaves three's bloom and the pixel grid alone at scale 1 and below", async () => {
    await boot({ search: "?scale=0.5" });
    const b = bloom() as any;
    b.setSize(960, 540);
    expect(b.sizes).toEqual([[960, 540]]);
    expect(b.materialHighPassFilter.fragmentShader).toBeUndefined();
    expect(b.materialHighPassFilter.vertexShader).toBeUndefined();
    expect(b.materialHighPassFilter.needsUpdate).toBeUndefined();
    expect(finalShader()).toContain(
      "h(gl_FragCoord.xy + fract(uFrame*0.61803)*100.)",
    );
    expect(finalShader()).toContain("sin(gl_FragCoord.y*3.14159*0.5)");
  });

  it.each([
    ["renamed a uniform", FED.filter((k) => k !== "smoothWidth")],
    ["dropped the material", null],
  ])("refuses to render a 4K master when three %s", async (_, highPass) => {
    const { win } = await boot({ search: "?scale=2", gpu: { highPass } });
    expect(win.__error).toContain(
      "--scale 2: this three.js changed UnrealBloomPass's bright pass uniforms",
    );
    expect(win.__ready).toBeUndefined();
    await expect(win.renderTime(0)).rejects.toThrow(/--scale 2/);
  });
});

describe("motion blur", () => {
  type Pass = {
    t: number;
    Et: number;
    frameT: number;
    pass: number;
    blurring: boolean;
    atFrame: number;
    earlier: number;
  };
  // a scene that records what each of its renders saw
  const probe = (log: Pass[], extra: Partial<Scene> = {}): Scene => ({
    render: (E, t) => {
      log.push({
        t,
        Et: E.t,
        frameT: E.frameT,
        pass: E.pass,
        blurring: E.blurring,
        atFrame: E.atFrame(t),
        earlier: E.atFrame(t - 0.5),
      });
    },
    ...extra,
  });
  const one = (log: Pass[], search = "?blur=4", extra = {}, entry = {}) =>
    boot({
      search,
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9, ...entry }] },
      scenes: { "x.js": probe(log, extra) },
    });

  // the fixed-function quads main.js renders into the float targets
  const fetchMats = () =>
    state.shaderMaterials.filter((m) =>
      String(m.fragmentShader).includes("texelFetch"),
    ) as Record<string, any>[];
  const addMat = () =>
    fetchMats().find((m) => !String(m.fragmentShader).includes("/ uN"))!;
  const divMat = () =>
    fetchMats().find((m) => String(m.fragmentShader).includes("/ uN"))!;
  const targetsOf = (mat: unknown) =>
    state.renderers[0].calls
      .filter(
        (c) => c[0] === "render" && (c[2] as any).children[0]?.material === mat,
      )
      .map((c) => c[1] as any);
  // the target layers composite into, which post reads
  const composited = () => (state.composers[0].passes[0] as any).map.target;
  // samples spread evenly over a 180 degree shutter at 60 fps, both ends included
  const spread = (a: number, len: number, n: number) =>
    Array.from({ length: n }, (_, j) => a + (len * j) / (n - 1));

  it("renders the other samples after the frame pass and averages them into the frame", async () => {
    const log: Pass[] = [];
    const { win, E } = await one(log);
    expect(E.blur).toMatchObject({ on: true, samples: 4, shutter: 180 });
    await win.renderTime(1);
    const times = spread(1, 1 / 120, 4);
    expect(log.map((p) => p.pass)).toEqual([0, 1, 2, 3]);
    log.forEach((p, j) => {
      expect(p.t).toBeCloseTo(times[j], 12);
      expect(p.Et).toBe(p.t);
      expect(p.frameT).toBe(1);
      expect(p.atFrame).toBe(1);
      // any other time keeps its offset from the sample, mapped onto the frame
      expect(p.earlier).toBeCloseTo(0.5, 12);
      expect(p.blurring).toBe(true);
    });
    expect([E.t, E.frameT, E.pass, E.frame]).toEqual([1, 1, 0, 60]);
    // with float blending, one float target sums the frame pass and the three samples
    const sums = targetsOf(addMat());
    expect(sums).toHaveLength(4);
    expect(new Set(sums).size).toBe(1);
    // the sum is cleared, color only, before the frame pass is added into it
    const calls = state.renderers[0].calls;
    const isSum = (kind: string) => (c: unknown[]) =>
      c[0] === kind && c[1] === sums[0];
    expect(calls.filter(isSum("clear"))).toEqual([
      ["clear", sums[0], true, false, false],
    ]);
    expect(calls.findIndex(isSum("clear"))).toBeLessThan(
      calls.findIndex(isSum("render")),
    );
    expect(sums[0].opts).toMatchObject({
      type: "FloatType",
      depthBuffer: false,
    });
    expect(addMat()).toMatchObject({
      blending: "CustomBlending",
      blendSrc: "OneFactor",
      blendDst: "OneFactor",
    });
    // the frame is kept aside, then the sum over the sample count replaces it
    const div = targetsOf(divMat());
    expect(div).toHaveLength(2);
    expect(div[0]).not.toBe(composited());
    expect(div[1]).toBe(composited());
    expect(divMat().uniforms.uN.value).toBe(4);
    expect(divMat().uniforms.tex.value).toBe(sums[0].texture);
    expect(state.renderers[0].composites).toHaveLength(4);
    expect(state.composers[0].renders).toBe(1);
  });

  it("ping-pongs two float targets when the GPU cannot blend floats", async () => {
    const log: Pass[] = [];
    const { win } = await boot({
      search: "?blur=4",
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }] },
      scenes: { "x.js": probe(log) },
      gpu: { floatBlend: false },
    });
    await win.renderTime(1);
    expect(addMat().blending).toBe("NoBlending");
    expect(addMat().fragmentShader).toContain(
      "texelFetch(tSum, p, 0) + texelFetch(tex, p, 0)",
    );
    const writes = targetsOf(addMat());
    expect(writes).toHaveLength(4);
    const [s1, s0] = writes;
    expect(s1).not.toBe(s0);
    expect(writes).toEqual([s1, s0, s1, s0]);
    // each pass reads the sum the previous one wrote, and the average reads the last
    expect(addMat().uniforms.tSum.value).toBe(s1.texture);
    expect(divMat().uniforms.tex.value).toBe(s0.texture);
    expect(divMat().uniforms.uN.value).toBe(4);
  });

  it("slides the shutter back before an E.cut so no sample crosses it", async () => {
    const log: Pass[] = [];
    const { win } = await one(log, "?blur=4", {
      load: (E: Engine) => E.cut(1.005),
    });
    await win.renderTime(1);
    // the frame pass is no sample here, so all four render again
    expect(log.map((p) => p.pass)).toEqual([0, 1, 2, 3, 4]);
    const samples = log.slice(1).map((p) => p.t);
    expect(samples[0]).toBeLessThan(1);
    expect(samples[3]).toBeCloseTo(1.005 - 1e-4, 12);
    expect(targetsOf(addMat())).toHaveLength(4);
    expect(divMat().uniforms.uN.value).toBe(4);
  });

  it("takes cuts from entries an --only preview does not load", async () => {
    const log: Pass[] = [];
    const { win, E } = await boot({
      search: "?only=x&blur=4",
      timeline: {
        TIMELINE: [
          { id: "x", start: 0, end: 9 },
          { id: "y", start: 1.005, end: 9 },
          { id: "v", start: 1.002, end: 9, canvas: "portrait" },
        ],
      },
      scenes: { "x.js": probe(log) },
    });
    expect(E.layers.map((l: Layer) => l.id)).toEqual(["x"]);
    await win.renderTime(1);
    // y's start bounds the shutter; v renders only on the portrait canvas, so it does not
    expect(log.at(-1)!.t).toBeCloseTo(1.005 - 1e-4, 12);
  });

  it.each([
    [
      "E.fast raises the sample count",
      { load: (E: Engine) => E.fast(0.9, 1.1, 6) },
      {},
      6,
    ],
    ["a whole-number entry blur is a floor", {}, { blur: 6 }, 6],
    [
      "E.sharp holds a moment still",
      { load: (E: Engine) => E.sharp(0.5, 1.5) },
      {},
      1,
    ],
  ])("%s", async (_, extra, entry, passes) => {
    const log: Pass[] = [];
    const { win } = await one(log, "?blur=4", extra, entry);
    await win.renderTime(1);
    expect(log).toHaveLength(passes);
  });

  it("lengthens the shutter and its samples inside an E.shutter window", async () => {
    const log: Pass[] = [];
    const { win } = await one(log, "?blur=4", {
      load: (E: Engine) => E.shutter(0.5, 1.5, 2),
    });
    await win.renderTime(1);
    const times = spread(1, 2 / 120, 8);
    expect(log.map((p) => p.t)).toEqual(
      times.map((t) => expect.closeTo(t, 12)),
    );
  });

  it.each([
    ["the entry", { blur: false }, {}],
    ["the scene", {}, { blur: false }],
  ])(
    "renders a layer sharp once per frame when %s says blur: false",
    async (_, entry, sceneBlur) => {
      const log: Pass[] = [];
      const hud: unknown[] = [];
      const { win } = await boot({
        search: "?blur=4",
        timeline: {
          TIMELINE: [
            { id: "x", start: 0, end: 9 },
            { id: "hud", start: 0, end: 99, z: 100, ...entry },
          ],
        },
        scenes: {
          "x.js": probe(log),
          "hud.js": {
            render: (E, t) => {
              hud.push({ t, pass: E.pass, blurring: E.blurring });
              return 0.7;
            },
            ...sceneBlur,
          },
        },
      });
      await win.renderTime(1);
      expect(log).toHaveLength(4);
      expect(hud).toEqual([{ t: 1, pass: 0, blurring: false }]);
      // every sample still composites the HUD's frame-pass target at its frame-pass opacity
      const comps = state.renderers[0].composites;
      expect(comps).toHaveLength(8);
      const hudComps = comps.filter((_c, i) => i % 2 === 1);
      expect(new Set(hudComps.map((c) => c.tex)).size).toBe(1);
      expect(hudComps.map((c) => c.opacity)).toEqual([0.7, 0.7, 0.7, 0.7]);
    },
  );

  it("lets an entry's blur: true override a sharp scene", async () => {
    const log: Pass[] = [];
    const { win } = await one(log, "?blur=4", { blur: false }, { blur: true });
    await win.renderTime(1);
    expect(log).toHaveLength(4);
  });

  it("keeps the frame pass's post and HUD, dropping what the samples write", async () => {
    const seen: number[] = [];
    const { win, E } = await boot({
      search: "?blur=4",
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }] },
      scenes: {
        "x.js": {
          render: (E) => {
            seen.push(E.post.flash);
            E.post.flash = E.pass === 0 ? 0.5 : 1;
            E.hud.label = E.pass === 0 ? "frame" : "sample";
          },
        },
      },
    });
    await win.renderTime(1);
    // each sample starts from the defaults, not from the frame pass's writes
    expect(seen).toEqual([0, 0, 0, 0]);
    expect(finalUniforms().uFlash.value).toBe(0.5);
    expect(E.hud.label).toBe("frame");
  });

  it("restores the frame's clock, post and HUD when a sample throws", async () => {
    let framePost: unknown, frameHud: unknown;
    const { win, E } = await boot({
      search: "?blur=4",
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }] },
      scenes: {
        "x.js": {
          render: (E) => {
            if (E.pass === 0) [framePost, frameHud] = [E.post, E.hud];
            if (E.pass === 2) throw new Error("sample broke");
          },
        },
      },
    });
    await expect(win.renderTime(1)).rejects.toThrow("sample broke");
    expect([E.t, E.pass]).toEqual([1, 0]);
    expect(E.post).toBe(framePost);
    expect(E.hud).toBe(frameHud);
    expect(state.composers[0].renders).toBe(0);
  });

  it("renders a frame without blur, and lists it, when a sample draws a clip prepare() did not advance", async () => {
    const clip = { name: "intro", meta: { n: 2 }, prepared: -1 };
    const { win } = await boot({
      search: "?blur=4",
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }] },
      scenes: {
        "x.js": {
          render: (E) => void E.plateMaterialFor(clip).onBeforeRender(),
        },
      },
    });
    await win.renderTime(1);
    expect(win.__blurFallbacks).toEqual([[60, "intro"]]);
    // the frame pass kept aside goes back undivided
    const [keep, back] = targetsOf(divMat());
    expect(back).toBe(composited());
    expect(divMat().uniforms.tex.value).toBe(keep.texture);
    expect(divMat().uniforms.uN.value).toBe(1);
  });

  it("lists only the frames whose samples draw a clip prepare() did not advance that frame", async () => {
    const { win } = await boot({
      search: "?blur=4",
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }] },
      scenes: {
        "x.js": {
          load: async (E, l) => void (l.v = await E.loadVideo("dance")),
          // the clip advances on the first frame only, and the third frame does not draw it
          prepare: async (_E, t, l) => void (t < 1.5 && (await l.v.frame(t))),
          render: (E, t, _rt, l) =>
            void (t < 2.5 && E.plateMaterialFor(l.v).onBeforeRender()),
        },
      },
    });
    for (const t of [1, 2, 3]) await win.renderTime(t);
    expect(win.__blurFallbacks).toEqual([[120, "dance"]]);
  });

  it("replays each layer's tracked points in its samples, frame after frame", async () => {
    const seen: [number, string][] = [];
    const { win } = await boot({
      search: "?blur=4",
      timeline: { TIMELINE: [{ id: "x", start: 0, end: 9 }] },
      scenes: {
        "x.js": {
          load: async (E, l) => void (l.v = await E.loadVideo("dance")),
          render: (E, t, _rt, l) => void seen.push([E.pass, l.v.trackAt(t)]),
        },
      },
    });
    await win.renderTime(1);
    await win.renderTime(2);
    // the samples land on later clip frames, yet keep the point the frame pass read
    expect(seen).toEqual([
      ...[0, 1, 2, 3].map((p) => [p, "p1000"]),
      ...[0, 1, 2, 3].map((p) => [p, "p2000"]),
    ]);
  });

  it("takes an --only preview's cuts from the variant it renders", async () => {
    const log: Pass[] = [];
    const { win } = await boot({
      search: "?only=x&variant=b&blur=4",
      timeline: {
        TIMELINE: [
          { id: "x", start: 0, end: 9 },
          { id: "ya", start: 1.003, end: 9, variant: "a" },
          { id: "yb", start: 1.006, end: 9, variant: "b" },
        ],
      },
      scenes: { "x.js": probe(log) },
    });
    await win.renderTime(1);
    expect(log.at(-1)!.t).toBeCloseTo(1.006 - 1e-4, 12);
  });

  it("plays sharp, rendering each layer once per frame", async () => {
    const log: Pass[] = [];
    const { win } = await one(log, "?play=2&blur=4");
    await vi.waitFor(() => expect(log.length).toBeGreaterThan(0));
    await win.renderTime(1);
    expect(log.every((p) => p.pass === 0 && !p.blurring)).toBe(true);
    expect(fetchMats()).toEqual([]);
  });

  it.each([
    [
      "E.fast(1, 2, 1): use seconds with start before end, and a sample count of 2 or more",
      (E: Engine) => E.fast(1, 2, 1),
    ],
    [
      "E.fast(1, 2, 2.5): use seconds with start before end, and a sample count of 2 or more",
      (E: Engine) => E.fast(1, 2, 2.5),
    ],
    [
      "E.shutter(1, 2, 0.5): use seconds with start before end, and a multiplier of 1 or more",
      (E: Engine) => E.shutter(1, 2, 0.5),
    ],
    [
      "E.sharp(2, 1): use seconds with start before end",
      (E: Engine) => E.sharp(2, 1),
    ],
    [
      "E.cut(NaN): use seconds with start before end",
      (E: Engine) => E.cut(NaN),
    ],
  ])("refuses a bad moment in load(): %s", async (message, load) => {
    const { win } = await one([], "?blur=4", { load });
    expect(win.__error).toContain(message);
    expect(win.__ready).toBeUndefined();
  });

  it("refuses a moment registered outside load()", async () => {
    const { win } = await one([], "?blur=4", {
      render: (E: Engine) => E.cut(1),
    });
    await expect(win.renderTime(1)).rejects.toThrow(
      "E.cut() belongs in load()",
    );
  });

  it.each([
    [
      { search: "?blur=maybe" },
      '--blur "maybe": use on, off or a sample count',
    ],
    [
      { timeline: { BLUR: { on: "yes" } } },
      'BLUR in timeline.js: on "yes", use true or false',
    ],
    [
      { timeline: { TIMELINE: [{ id: "x", start: 0, end: 9, blur: "soft" }] } },
      'x: blur "soft": use false (sharp, like the HUD), true, or a sample count of 2 or more',
    ],
    [
      { search: "?blur=on", gpu: { colorBufferFloat: false } },
      "motion blur needs float render targets (EXT_color_buffer_float): render with --blur off",
    ],
  ])("stops the boot on %j", async (opts, message) => {
    const { win } = await boot({
      scenes: { "x.js": { render: () => 1 } },
      ...(opts as Parameters<typeof boot>[0]),
    });
    expect(win.__error).toContain(message);
    expect(win.__ready).toBeUndefined();
  });

  it("boots without float targets while blur is off", async () => {
    const { win } = await boot({ gpu: { colorBufferFloat: false } });
    expect(win.__ready).toBe(true);
  });
});
