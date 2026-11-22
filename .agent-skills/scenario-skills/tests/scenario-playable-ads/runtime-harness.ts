// Loads the shared playable runtime in-process (so coverage sees it) behind the smallest fake
// browser its code paths read: a window, a document, a recording 2D context, Image, FontFace and an
// optional Web Audio context. Nothing here reimplements runtime logic.
import { vi } from "vitest";

const RUNTIME = "../../skills/scenario-playable-ads/assets/runtime/runtime.js";

export type Call = { k: string; a: unknown[] };

// A 2D context that records every method call and property write.
export function recorder() {
  const calls: Call[] = [];
  const gradient = { addColorStop: () => undefined };
  const ctx: any = new Proxy({} as Record<string, unknown>, {
    get: (target, k: string) => {
      if (k in target) return target[k];
      return (...a: unknown[]) => {
        calls.push({ k, a });
        return k.startsWith("create") ? gradient : undefined;
      };
    },
    set: (target, k: string, v) => {
      calls.push({ k: k + "=", a: [v] });
      target[k] = v;
      return true;
    },
  });
  const of = (k: string) => calls.filter((c) => c.k === k).map((c) => c.a);
  return { ctx, calls, of };
}

// Image whose size comes from its src ("img:WxH"); "bad" fires onerror instead of onload.
export class FakeImage {
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    const m = /^img:(\d+)x(\d+)$/.exec(v);
    queueMicrotask(() => {
      if (m) {
        this.width = Number(m[1]);
        this.height = Number(m[2]);
        this.onload?.();
      } else this.onerror?.();
    });
  }
}

export class FakeParam {
  value = 0;
  log: unknown[][] = [];
  setTargetAtTime(...a: number[]) {
    this.log.push(["target", ...a]);
  }
  cancelScheduledValues(...a: number[]) {
    this.log.push(["cancel", ...a]);
  }
  setValueAtTime(...a: number[]) {
    this.log.push(["set", ...a]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.log.push(["ramp", v, t]);
    this.value = v;
  }
}

export class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  state = "running";
  currentTime = 0;
  destination = {};
  resumes = 0;
  suspends = 0;
  started: any[] = [];
  gains: any[] = [];
  decodes: { buf: ArrayBuffer; ok: (b: unknown) => void; err: () => void }[] =
    [];
  constructor() {
    FakeAudioContext.last = this;
  }
  createGain() {
    const g = { gain: new FakeParam(), to: null as unknown };
    (g as any).connect = (n: unknown) => (g.to = n);
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s: any = {
      buffer: null,
      loop: false,
      playbackRate: new FakeParam(),
      to: null,
    };
    s.connect = (n: unknown) => (s.to = n);
    s.start = () => this.started.push(s);
    return s;
  }
  decodeAudioData(buf: ArrayBuffer, ok: (b: unknown) => void, err: () => void) {
    this.decodes.push({ buf, ok, err });
  }
  resume() {
    this.resumes++;
    this.state = "running";
  }
  suspend() {
    this.suspends++;
    this.state = "suspended";
  }
}

// Global overrides, restored by restoreGlobals() after each test. Node 22 defines navigator as a
// getter, so a plain assignment would not replace it.
const saved = new Map<string, PropertyDescriptor | undefined>();
export function setGlobal(name: string, value: unknown) {
  if (!saved.has(name))
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}
export function restoreGlobals() {
  for (const [name, d] of saved) {
    if (d) Object.defineProperty(globalThis, name, d);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  saved.clear();
}

type Listeners = Record<string, ((e?: any) => void)[]>;
function target() {
  const listeners: Listeners = {};
  return {
    listeners,
    addEventListener(t: string, f: (e?: any) => void) {
      (listeners[t] ||= []).push(f);
    },
    fire(t: string, e?: any) {
      for (const f of listeners[t] || []) f(e);
    },
  };
}

export type LoadOptions = {
  network?: string;
  width?: number;
  height?: number;
  dpr?: number;
  ua?: string;
  touchPoints?: number;
  qa?: Record<string, unknown>;
  audio?: boolean;
  win?: Record<string, unknown>;
};

export async function loadRuntime(o: LoadOptions = {}) {
  vi.resetModules();
  FakeAudioContext.last = null;
  const rec = recorder();
  const created: any[] = [];
  const canvas: any = {
    width: 0,
    height: 0,
    style: {},
    ...target(),
    getContext: () => rec.ctx,
  };
  const doc: any = {
    hidden: false,
    ...target(),
    fontsAdded: [] as unknown[],
    getElementById: (id: string) => (id === "c" ? canvas : null),
    createElement: () => {
      const r = recorder();
      const c = { width: 0, height: 0, getContext: () => r.ctx, rec: r };
      created.push(c);
      return c;
    },
  };
  doc.fonts = { add: (f: unknown) => doc.fontsAdded.push(f) };
  const win: any = {
    innerWidth: o.width ?? 360,
    innerHeight: o.height ?? 640,
    devicePixelRatio: o.dpr ?? 1,
    NETWORK: o.network,
    __QA: o.qa,
    open: vi.fn(),
    ...target(),
    ...(o.win || {}),
  };
  if (!("parent" in win)) win.parent = win;
  if (o.audio) win.AudioContext = FakeAudioContext;
  const raf: ((t: number) => void)[] = [];
  setGlobal("window", win);
  setGlobal("document", doc);
  setGlobal("navigator", {
    userAgent: o.ua ?? "Mozilla/5.0 (Linux; Android 14)",
    maxTouchPoints: o.touchPoints ?? 5,
  });
  setGlobal("requestAnimationFrame", (f: (t: number) => void) => raf.push(f));
  setGlobal("Image", FakeImage);
  await import(RUNTIME);
  const PA = win.PA;
  let now = 1000;

  const env = {
    PA,
    win,
    doc,
    canvas,
    rec,
    created,
    raf,
    // runs one requestAnimationFrame round, `ms` after the previous one
    frame(ms = 50) {
      now += ms;
      const fs = raf.splice(0);
      for (const f of fs) f(now);
    },
    // real seconds of play in 50 ms frames (the runtime caps one frame at 0.05 s)
    run(sec: number) {
      for (let i = 0; i < Math.round(sec / 0.05); i++) env.frame(50);
    },
    pointer(type: string, x: number, y: number, id = 1) {
      const e = {
        clientX: x,
        clientY: y,
        pointerId: id,
        preventDefault: vi.fn(),
      };
      if (type === "pointerdown") canvas.fire(type, e);
      else win.fire(type, e);
      return e;
    },
    tap(x: number, y: number, id = 1) {
      const e = env.pointer("pointerdown", x, y, id);
      env.pointer("pointerup", x, y, id);
      return e;
    },
    events(name?: string) {
      return PA.events.filter((e: any) => !name || e.name === name);
    },
  };
  return env;
}

export type Env = Awaited<ReturnType<typeof loadRuntime>>;

export function makeGame(extra: Record<string, any> = {}) {
  return {
    init: vi.fn(),
    update: vi.fn(),
    draw: vi.fn(),
    onDown: vi.fn(),
    onMove: vi.fn(),
    onUp: vi.fn(),
    ...extra,
  };
}

export const STORE = {
  ios: "https://ios.example",
  android: "https://and.example",
};

// boot with a game and wait for image and font loads to settle
export async function boot(
  env: Env,
  cfg: Record<string, any> = {},
  game: Record<string, any> = makeGame(),
) {
  env.PA.boot({ store: STORE, ...cfg }, game);
  await new Promise((r) => setTimeout(r, 0));
  return game;
}
