// Minimal stand-ins for three and the browser, shared by the engine suites. Every
// object records what the engine did to it, so a test asserts on what reached the
// renderer, never on how the engine got there.

export type Call = [string, ...unknown[]];

type State = {
  renderers: FakeRenderer[];
  composers: FakeComposer[];
  shaderMaterials: Record<string, unknown>[];
  fontUrls: string[];
};
// vi.resetModules gives every mock factory a fresh copy of this module, so the
// record lives on globalThis where the test's own copy sees it too.
const KEY = Symbol.for("kinetic-engine-fakes");
const g = globalThis as unknown as Record<symbol, State>;
export const state: State = (g[KEY] ??= {
  renderers: [],
  composers: [],
  shaderMaterials: [],
  fontUrls: [],
});

export function resetState() {
  state.renderers = [];
  state.composers = [];
  state.shaderMaterials = [];
  state.fontUrls = [];
}

class Vector2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}
  set(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
}
class Vector3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setScalar(s: number) {
    return this.set(s, s, s);
  }
}
class Vector4 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 0,
  ) {}
  set(x: number, y: number, z: number, w: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
}
class Color {
  r = 0;
  g = 0;
  b = 0;
  value: unknown;
  constructor(...a: unknown[]) {
    if (a.length === 3) [this.r, this.g, this.b] = a as number[];
    else this.value = a[0];
  }
  setRGB(r: number, g: number, b: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }
  set(v: unknown) {
    this.value = v;
    return this;
  }
  setScalar(s: number) {
    return this.setRGB(s, s, s);
  }
  multiplyScalar(m: number) {
    this.value = [this.value, m];
    return this;
  }
}
class Scene {
  children: unknown[] = [];
  add(o: unknown) {
    this.children.push(o);
  }
}
class OrthographicCamera {
  projectionUpdates = 0;
  constructor(
    public left = 0,
    public right = 0,
    public top = 0,
    public bottom = 0,
  ) {}
  updateProjectionMatrix() {
    this.projectionUpdates++;
  }
}
class PerspectiveCamera {
  position = new Vector3();
  viewOffset: number[] | null = null;
  constructor(
    public fov = 50,
    public aspect = 1,
  ) {}
  setViewOffset(...a: number[]) {
    this.viewOffset = a;
  }
}
class PlaneGeometry {
  constructor(
    public w = 1,
    public h = 1,
  ) {}
}
class Mesh {
  scale = new Vector3(1, 1, 1);
  position = new Vector3();
  rotation = { z: 0 };
  constructor(
    public geometry: unknown,
    public material: unknown,
  ) {}
}
class ShaderMaterial {
  [k: string]: unknown;
  constructor(p: Record<string, unknown>) {
    Object.assign(this, p);
    state.shaderMaterials.push(this);
  }
}
class MeshBasicMaterial {
  [k: string]: unknown;
  color: Color;
  constructor(p: Record<string, unknown> = {}) {
    Object.assign(this, p);
    this.color = (p.color as Color) ?? new Color();
  }
}
class Texture {
  [k: string]: unknown;
  constructor(public image?: unknown) {}
}
class WebGLRenderTarget {
  texture: { target: WebGLRenderTarget };
  constructor(
    public width: number,
    public height: number,
    public opts: Record<string, unknown> = {},
  ) {
    this.texture = { target: this };
  }
}

// What a composite draw looked like when it reached the renderer.
export type Composite = {
  target: unknown;
  tex: unknown;
  opacity: number;
  blendSrc: unknown;
  blendDst: unknown;
};

class FakeRenderer {
  calls: Call[] = [];
  composites: Composite[] = [];
  target: unknown = null;
  constructor(public opts: Record<string, unknown>) {
    state.renderers.push(this);
  }
  setPixelRatio(r: number) {
    this.calls.push(["setPixelRatio", r]);
  }
  setSize(w: number, h: number, style: boolean) {
    this.calls.push(["setSize", w, h, style]);
  }
  setRenderTarget(t: unknown) {
    this.target = t;
    this.calls.push(["setRenderTarget", t]);
  }
  setClearColor(c: number, a: number) {
    this.calls.push(["setClearColor", c, a]);
  }
  clear(...a: boolean[]) {
    this.calls.push(["clear", this.target, ...a]);
  }
  render(scene: Scene, cam: unknown) {
    this.calls.push(["render", this.target, scene, cam]);
    const m = (scene.children[0] as Mesh | undefined)?.material as
      Record<string, { value: unknown }> | undefined;
    if (m && m.uniforms && "opacity" in (m.uniforms as object)) {
      const u = m.uniforms as unknown as Record<string, { value: unknown }>;
      this.composites.push({
        target: this.target,
        tex: u.tex.value,
        opacity: u.opacity.value as number,
        blendSrc: m.blendSrc,
        blendDst: m.blendDst,
      });
    }
  }
}
export type { FakeRenderer };

type Pass = { uniforms?: Record<string, { value: unknown }> };
class FakeComposer {
  passes: Pass[] = [];
  renders = 0;
  constructor(
    public renderer: FakeRenderer,
    public target: WebGLRenderTarget,
  ) {
    state.composers.push(this);
  }
  setPixelRatio() {}
  setSize(w: number, h: number) {
    this.size = [w, h];
  }
  size: number[] = [];
  addPass(p: Pass) {
    this.passes.push(p);
  }
  render() {
    this.renders++;
  }
}
export type { FakeComposer };

const constants = Object.fromEntries(
  [
    "LinearSRGBColorSpace",
    "SRGBColorSpace",
    "NoColorSpace",
    "NoToneMapping",
    "HalfFloatType",
    "CustomBlending",
    "NormalBlending",
    "AdditiveBlending",
    "OneFactor",
    "ZeroFactor",
    "DstColorFactor",
    "OneMinusSrcColorFactor",
    "OneMinusSrcAlphaFactor",
    "AddEquation",
    "DoubleSide",
    "LinearFilter",
    "LinearMipmapLinearFilter",
  ].map((k) => [k, k]),
);

export const three = {
  ...constants,
  Vector2,
  Vector3,
  Vector4,
  Color,
  Scene,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Mesh,
  ShaderMaterial,
  MeshBasicMaterial,
  Texture,
  CanvasTexture: Texture,
  WebGLRenderTarget,
  WebGLRenderer: FakeRenderer,
  MathUtils: { degToRad: (d: number) => (d * Math.PI) / 180 },
};

export const addons = {
  EffectComposer: FakeComposer,
  TexturePass: class {
    constructor(public map: unknown) {}
  },
  UnrealBloomPass: class {
    constructor(
      public resolution: Vector2,
      public strength: number,
      public radius: number,
      public threshold: number,
    ) {}
  },
  ShaderPass: class {
    uniforms: Record<string, { value: unknown }>;
    constructor(shader: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = shader.uniforms;
    }
  },
  TTFLoader: class {
    async loadAsync(url: string) {
      state.fontUrls.push(url);
      return { url };
    }
  },
  Font: class {
    constructor(public data: unknown) {}
  },
};

// A 2D context that records every draw with the style in force when it ran.
export type Draw = {
  op: string;
  args: unknown[];
  alpha: number;
  fill: unknown;
  stroke: unknown;
  align: unknown;
};
export function fakeCtx() {
  const draws: Draw[] = [];
  const stack: Record<string, unknown>[] = [];
  const ctx: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    textAlign: "start",
    draws,
  };
  const styleKeys = ["globalAlpha", "fillStyle", "strokeStyle", "textAlign"];
  const record =
    (op: string) =>
    (...args: unknown[]) =>
      draws.push({
        op,
        args,
        alpha: ctx.globalAlpha as number,
        fill: ctx.fillStyle,
        stroke: ctx.strokeStyle,
        align: ctx.textAlign,
      });
  for (const op of [
    "fillText",
    "fillRect",
    "strokeRect",
    "fill",
    "stroke",
    "moveTo",
    "lineTo",
    "setLineDash",
    "translate",
    "scale",
  ])
    ctx[op] = record(op);
  ctx.beginPath = () => {};
  ctx.setTransform = () => {};
  ctx.clearRect = () => {};
  ctx.save = () =>
    stack.push(Object.fromEntries(styleKeys.map((k) => [k, ctx[k]])));
  ctx.restore = () => Object.assign(ctx, stack.pop());
  return ctx as Record<string, unknown> & { draws: Draw[] };
}

// Browser globals the engine reads, set for one test and put back after it.
const saved: [string, PropertyDescriptor | undefined][] = [];
export function setGlobal(name: string, value: unknown) {
  saved.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}
export function restoreGlobals() {
  for (const [name, d] of saved.splice(0).reverse()) {
    if (d) Object.defineProperty(globalThis, name, d);
    else delete (globalThis as Record<string, unknown>)[name];
  }
}
