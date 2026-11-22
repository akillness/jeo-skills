// Stand-ins for three and a Canvas2D context, for the core, typekit and roto suites.
// The 2D context measures text as a fixed advance per character (0.6 em plus letter
// spacing), so layout math has exact expected values. Like a browser canvas, resizing
// resets its state, which catches a font that is not reapplied after a resize.

export const SRGBColorSpace = "srgb";
export const NoColorSpace = "";
export const LinearFilter = 1006;
export const LinearMipmapLinearFilter = 1008;
export const NormalBlending = 1;
export const AdditiveBlending = 2;
export const CustomBlending = 5;
export const OneFactor = 201;
export const OneMinusSrcAlphaFactor = 205;
export const DoubleSide = 2;

class Vec {
  x = 0;
  y = 0;
  z = 0;
  w = 0;
  constructor(x = 0, y = 0, z = 0, w = 0) {
    this.set(x, y, z, w);
  }
  set(x: number, y: number, z = 0, w = 0) {
    Object.assign(this, { x, y, z, w });
    return this;
  }
}
export class Vector2 extends Vec {}
export class Vector3 extends Vec {}
export class Vector4 extends Vec {}

export class Color {
  r: number;
  g: number;
  b: number;
  constructor(public input: string) {
    const n = parseInt(String(input).replace("#", ""), 16);
    this.r = ((n >> 16) & 255) / 255;
    this.g = ((n >> 8) & 255) / 255;
    this.b = (n & 255) / 255;
  }
  multiplyScalar(s: number) {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }
  setScalar(s: number) {
    this.r = this.g = this.b = s;
    return this;
  }
}

export class Texture {
  image: unknown = null;
  needsUpdate = false;
  userData: Record<string, unknown> = {};
  [k: string]: unknown;
}
export class CanvasTexture extends Texture {
  constructor(image: unknown) {
    super();
    this.image = image;
  }
}

export class ShaderMaterial {
  uniforms: Record<string, { value: any }>;
  [k: string]: any;
  constructor(params: Record<string, any>) {
    Object.assign(this, params);
    this.uniforms = params.uniforms;
  }
}
export class MeshBasicMaterial {
  color = new Color("#ffffff");
  map: unknown = null;
  [k: string]: any;
  constructor(params: Record<string, any>) {
    Object.assign(this, params);
  }
}
export class PlaneGeometry {
  constructor(
    public width: number,
    public height: number,
  ) {}
}
export class Mesh {
  scale = new Vector3(1, 1, 1);
  position = new Vector3();
  constructor(
    public geometry: unknown,
    public material: unknown,
  ) {}
}
export class Scene {
  children: unknown[] = [];
  add(o: unknown) {
    this.children.push(o);
  }
}
export class OrthographicCamera {
  constructor(
    public left: number,
    public right: number,
    public top: number,
    public bottom: number,
    public near: number,
    public far: number,
  ) {}
}

export function fakeRenderer() {
  const calls: unknown[][] = [];
  return {
    calls,
    setRenderTarget: (t: unknown) => calls.push(["setRenderTarget", t]),
    clear: () => calls.push(["clear"]),
    render: (scene: unknown, cam: unknown) =>
      calls.push(["render", scene, cam]),
  };
}

// three/addons stand-ins: a TTF loader that counts loads, and a TextGeometry
// whose bounding box is a known function of its text so centering is checkable.
export const loads: string[] = [];
export class TTFLoader {
  async loadAsync(url: string) {
    loads.push(url);
    return { url };
  }
}
export class Font {
  constructor(public data: unknown) {}
}
export class TextGeometry {
  translations: number[][] = [];
  boundingBox: { min: Vec; max: Vec } | null = null;
  min: Vec;
  max: Vec;
  constructor(
    public text: string,
    public params: Record<string, any>,
  ) {
    this.min = new Vec(1, 2, -params.depth);
    this.max = new Vec(1 + text.length * params.size, 2 + params.size, 0);
  }
  computeBoundingBox() {
    this.boundingBox = {
      min: new Vec(this.min.x, this.min.y, this.min.z),
      max: new Vec(this.max.x, this.max.y, this.max.z),
    };
  }
  translate(x: number, y: number, z: number) {
    this.translations.push([x, y, z]);
    for (const v of [this.min, this.max]) v.set(v.x + x, v.y + y, v.z + z);
  }
}

const DEFAULTS = {
  font: "10px sans-serif",
  fontStretch: "normal",
  letterSpacing: "0px",
  textAlign: "start",
  textBaseline: "alphabetic",
  globalAlpha: 1,
  fillStyle: "#000000",
  strokeStyle: "#000000",
  lineWidth: 1,
  lineJoin: "miter",
  shadowColor: "rgba(0, 0, 0, 0)",
  shadowBlur: 0,
  tx: 0,
  ty: 0,
  sx: 1,
  sy: 1,
  rot: 0,
  skew: 0,
};
type CtxState = typeof DEFAULTS;
export type Draw = CtxState & {
  op: string;
  text: string;
  x: number;
  y: number;
};

export class FakeContext2D {
  [k: string]: any;
  draws: Draw[] = [];
  calls: unknown[][] = [];
  stack: CtxState[] = [];
  constructor() {
    this.reset();
  }
  reset() {
    Object.assign(this, DEFAULTS);
    this.stack = [];
  }
  private snap(): CtxState {
    const s: Record<string, unknown> = {};
    for (const k of Object.keys(DEFAULTS)) s[k] = this[k];
    return s as CtxState;
  }
  save() {
    this.stack.push(this.snap());
  }
  restore() {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
  }
  translate(x: number, y: number) {
    this.tx += x;
    this.ty += y;
  }
  rotate(r: number) {
    this.rot += r;
  }
  transform(a: number, b: number, c: number) {
    this.skew += c;
  }
  scale(x: number, y: number) {
    this.sx *= x;
    this.sy *= y;
  }
  setTransform(...a: number[]) {
    this.calls.push(["setTransform", ...a]);
  }
  clearRect(...a: number[]) {
    this.calls.push(["clearRect", ...a]);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.calls.push(["fillRect", x, y, w, h, this.fillStyle, this.globalAlpha]);
  }
  measureText(text: string) {
    const px = parseFloat(/([\d.]+)px/.exec(this.font)![1]);
    const n = [...text].length;
    return { width: n * px * 0.6 + n * parseFloat(this.letterSpacing) };
  }
  fillText(text: string, x: number, y: number) {
    this.draws.push({ ...this.snap(), op: "fill", text, x, y });
  }
  strokeText(text: string, x: number, y: number) {
    this.draws.push({ ...this.snap(), op: "stroke", text, x, y });
  }
}

export class FakeCanvas {
  private _w = 300;
  private _h = 150;
  ctx = new FakeContext2D();
  get width() {
    return this._w;
  }
  set width(v: number) {
    this._w = v;
    this.ctx.reset();
  }
  get height() {
    return this._h;
  }
  set height(v: number) {
    this._h = v;
    this.ctx.reset();
  }
  getContext(kind: string) {
    return kind === "2d" ? this.ctx : null;
  }
}

export const canvases: FakeCanvas[] = [];
export const fakeDocument = {
  createElement(tag: string) {
    if (tag !== "canvas") throw new Error(`unexpected element ${tag}`);
    const c = new FakeCanvas();
    canvases.push(c);
    return c;
  },
};

// Stands in for vitest's global stubbing, whose method name fails the repo's spell check
const saved = new Map<string, unknown>();
export function setGlobal(name: string, value: unknown) {
  const g = globalThis as Record<string, unknown>;
  if (!saved.has(name)) saved.set(name, g[name]);
  g[name] = value;
}
export function restoreGlobals() {
  const g = globalThis as Record<string, unknown>;
  for (const [name, value] of saved) {
    if (value === undefined) delete g[name];
    else g[name] = value;
  }
  saved.clear();
}
