// Kinetic-music-video engine core: deterministic helpers shared by every scene.
// Everything is a pure function of global song time `t` (seconds). Never use Date/performance/Math.random.
// With motion blur on, render() runs several times per output frame and prepare() once (ENGINE_API.md, Motion blur).
import * as THREE from "three";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { Font } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { clock, replayIndex } from "./blur.js";

export function stretchKW(v) {
  if (!v || v === "normal") return "normal";
  if (typeof v === "string" && !v.endsWith("%")) return v;
  const x = parseFloat(v);
  const K = [
    [50, "ultra-condensed"],
    [62.5, "extra-condensed"],
    [75, "condensed"],
    [87.5, "semi-condensed"],
    [100, "normal"],
    [112.5, "semi-expanded"],
    [125, "expanded"],
    [150, "extra-expanded"],
  ];
  let b = K[0];
  for (const k of K) if (Math.abs(k[0] - x) < Math.abs(b[0] - x)) b = k;
  return b[1];
}
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const remap = (x, a, b, c = 0, d = 1) =>
  lerp(c, d, clamp((x - a) / (b - a)));
export const fract = (x) => x - Math.floor(x);

export const ease = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) =>
    x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inQuart: (x) => x * x * x * x,
  inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: (x) =>
    x <= 0
      ? 0
      : x >= 1
        ? 1
        : x < 0.5
          ? Math.pow(2, 20 * x - 10) / 2
          : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: (x, s = 1.70158) =>
    1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  outElastic: (x) =>
    x <= 0
      ? 0
      : x >= 1
        ? 1
        : Math.pow(2, -10 * x) *
            Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) +
          1,
  smooth: (x) => x * x * (3 - 2 * x),
};
// ease applied over a window: 0 before t0, 1 after t0+dur
export const tween = (t, t0, dur, fn = ease.outCubic) =>
  fn(clamp((t - t0) / dur));
// damped spring step response (0 -> 1), good for overshoot pops. k stiffness, z damping ratio
export function spring(dt, k = 260, z = 0.42) {
  if (dt <= 0) return 0;
  const w = Math.sqrt(k),
    wd = w * Math.sqrt(1 - z * z);
  return (
    1 -
    Math.exp(-z * w * dt) *
      (Math.cos(wd * dt) + ((z * w) / wd) * Math.sin(wd * dt))
  );
}

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash1 = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
export function noise1(x) {
  const i = Math.floor(x),
    f = x - i,
    u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
export function noise2(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const h = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy);
  return (
    lerp(
      lerp(h(ix, iy), h(ix + 1, iy), ux),
      lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux),
      uy,
    ) *
      2 -
    1
  );
}

// ---------- palette (sRGB hex; use E.col() for linear THREE.Color). REPLACE PER PROJECT from STYLE.md.
// Keep the role keys black / ink / white / accent (the HUD and templates use them). The rest is a starter set for three looks.
export const PAL = {
  // roles
  black: "#000000",
  ink: "#0B0B0B",
  white: "#FFF6E6",
  accent: "#FFC21A",
  // dark look: black + glowing warm lines (HDR > 1 blooms)
  ember: "#3A1200",
  rust: "#8A2E00",
  hot: "#FF4A1C",
  orange: "#FF6A13",
  amber: "#FFB000",
  gold: "#FFC21A",
  // paper look: white / bone + ink + one accent
  paper: "#F4F1EA",
  pure: "#FFFFFF",
  grey: "#8C8A86",
  // pop look: flat colour fields
  tangerine: "#FF6A13",
  lemon: "#FFE14D",
  pink: "#FF7AC0",
  cobalt: "#2F54FF",
  mint: "#3EE6B0",
  lilac: "#B9A7FF",
};

// ---------- audio / lyric timeline
export function makeTimeline(A, L) {
  const fps = A.env_fps;
  const env = (name, t) => {
    const arr = A.env[name];
    const x = t * fps;
    const i = Math.floor(x);
    if (i < 0) return arr[0];
    if (i >= arr.length - 1) return arr[arr.length - 1];
    return lerp(arr[i], arr[i + 1], x - i);
  };
  // smoothed envelope (average over window)
  const envAvg = (name, t, win = 0.1) => {
    let s = 0,
      n = 6;
    for (let k = 0; k < n; k++) s += env(name, t - win * (k / (n - 1)));
    return s / n;
  };
  const bsearch = (arr, t) => {
    let lo = 0,
      hi = arr.length - 1,
      r = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (arr[m] <= t) {
        r = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    return r;
  };
  const last = (list, t) => {
    const arr = A[list];
    const i = bsearch(arr, t);
    return i < 0 ? null : { i, t: arr[i], dt: t - arr[i] };
  };
  const next = (list, t) => {
    const arr = A[list];
    const i = bsearch(arr, t) + 1;
    return i >= arr.length ? null : { i, t: arr[i], dt: arr[i] - t };
  };
  const pulse = (list, t, decay = 0.12, lead = 0) => {
    const e = last(list, t + lead);
    return e ? Math.exp(-e.dt / decay) : 0;
  };
  const beat = (t) => {
    const b = A.beats;
    const i = Math.max(0, bsearch(b, t));
    const t0 = b[i],
      t1 = b[i + 1] ?? t0 + 60 / A.bpm;
    const phase = clamp((t - t0) / (t1 - t0));
    const d = A.downbeats;
    const bi = Math.max(0, bsearch(d, t));
    const bar0 = d[bi];
    let inBar = 0;
    for (let k = i; k >= 0 && b[k] > bar0 + 0.01; k--) inBar++;
    return {
      i,
      t0,
      t1,
      phase,
      bar: bi,
      barT0: bar0,
      inBar,
      isDown: Math.abs(t0 - bar0) < 0.02,
      len: t1 - t0,
    };
  };
  // words flattened
  const words = [];
  L.lines.forEach((ln, li) =>
    ln.words.forEach((w, wi) =>
      words.push({ ...w, li, wi, section: ln.section, line: ln }),
    ),
  );
  const lineAt = (t, lead = 0.2) => {
    let r = null;
    for (const ln of L.lines) {
      if (ln.s - lead <= t) r = ln;
    }
    return r;
  };
  const wordAt = (t, lead = 0.0) => {
    let r = null;
    for (const w of words) {
      if (w.s - lead <= t) r = w;
      else break;
    }
    return r;
  };
  const wordsIn = (t0, t1) => words.filter((w) => w.s >= t0 && w.s < t1);
  const section = (name) => L.lines.filter((l) => l.section === name);
  return {
    A,
    L,
    fps,
    env,
    envAvg,
    last,
    next,
    pulse,
    beat,
    words,
    lineAt,
    wordAt,
    wordsIn,
    section,
    bpm: A.bpm,
    spb: 60 / A.bpm,
  };
}

// ---------- text utilities
const _canvasCache = new Map();
// Draw text into a canvas sized to fit. opts: {font:'Archivo', weight:900, stretch:'100%', size:200, tracking:0 (em), color, italic, stroke:0, strokeColor, pad, glow}
export function textCanvas(text, o = {}) {
  const key = JSON.stringify([text, o]);
  if (_canvasCache.has(key)) return _canvasCache.get(key);
  const size = o.size ?? 200,
    pad = o.pad ?? Math.ceil(size * 0.35);
  const fontStr = `${o.italic ? "italic " : ""}${o.weight ?? 900} ${o.stretch ? o.stretch + " " : ""}${size}px "${o.font ?? "Archivo"}"`;
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  g.font = fontStr;
  if (o.stretch) g.fontStretch = stretchKW(o.stretch);
  const tr = (o.tracking ?? 0) * size;
  g.letterSpacing = `${tr}px`;
  const m = g.measureText(text);
  const w = Math.ceil(m.width + pad * 2),
    h = Math.ceil(size * (o.lineH ?? 1.25) + pad * 2);
  c.width = w;
  c.height = h;
  g.font = fontStr;
  if (o.stretch) g.fontStretch = stretchKW(o.stretch);
  g.letterSpacing = `${tr}px`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  if (o.glow) {
    g.shadowColor = o.glowColor ?? o.color ?? PAL.accent;
    g.shadowBlur = o.glow;
  }
  if (o.stroke) {
    g.lineWidth = o.stroke;
    g.strokeStyle = o.strokeColor ?? o.color ?? PAL.accent;
    g.lineJoin = "round";
    g.strokeText(text, pad, h / 2);
  }
  if (!o.strokeOnly) {
    g.fillStyle = o.color ?? PAL.white;
    g.fillText(text, pad, h / 2);
  }
  const r = { canvas: c, w, h, pad, textW: m.width, size };
  _canvasCache.set(key, r);
  return r;
}
const _texCache = new Map();
export function textTexture(text, o = {}) {
  const key = JSON.stringify([text, o]);
  if (_texCache.has(key)) return _texCache.get(key);
  const r = textCanvas(text, o);
  const tex = new THREE.CanvasTexture(r.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const out = { ...r, tex, aspect: r.w / r.h };
  _texCache.set(key, out);
  return out;
}

// 3D extruded type via TTF
const _fonts = {};
const _geoCache = new Map();
export async function loadFont3D(name, url) {
  if (_fonts[name]) return _fonts[name];
  const loader = new TTFLoader();
  const json = await loader.loadAsync(url);
  _fonts[name] = new Font(json);
  return _fonts[name];
}
export function text3D(str, o = {}) {
  const key = JSON.stringify([str, o]);
  if (_geoCache.has(key)) return _geoCache.get(key);
  const font = _fonts[o.font ?? "ArchivoBlack"];
  if (!font) throw new Error("font not loaded: " + o.font);
  const g = new TextGeometry(str, {
    font,
    size: o.size ?? 1,
    depth: o.depth ?? 0.3,
    curveSegments: o.curveSegments ?? 6,
    bevelEnabled: o.bevel ?? true,
    bevelThickness: o.bevelThickness ?? 0.02,
    bevelSize: o.bevelSize ?? 0.015,
    bevelSegments: o.bevelSegments ?? 2,
  });
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const cx = (bb.max.x + bb.min.x) / 2,
    cy = (bb.max.y + bb.min.y) / 2,
    cz = (bb.max.z + bb.min.z) / 2;
  if (o.center !== false) g.translate(-cx, -cy, -cz);
  g.computeBoundingBox();
  _geoCache.set(key, g);
  return g;
}

// ---------- fullscreen helpers
export class FSQuad {
  constructor(material) {
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }
  set material(m) {
    this.mesh.material = m;
  }
  get material() {
    return this.mesh.material;
  }
  render(renderer, target, clear = false) {
    renderer.setRenderTarget(target);
    if (clear) renderer.clear();
    renderer.render(this.scene, this.cam);
  }
}

// A per-scene 2D drawing surface uploaded as texture each frame
export function makeG2D(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return {
    canvas,
    ctx,
    tex,
    w,
    h,
    clear() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
    },
    commit() {
      tex.needsUpdate = true;
    },
  };
}

// ---------- video frame sequences (generated clips, pre-extracted to /assets/video/<clip>/f_00001.jpg + meta.json)
const _vids = {};
// main.js calls this before each frame pass: forget the last frame's trackAt calls, and record this frame's when its
// motion-blur samples will replay them. Calls are kept per layer, since a sample re-renders only the blurred layers and
// never runs prepare().
const _tracked = new Set();
export function trackFrame(keep) {
  for (const v of _tracked) v._seen = null;
  _tracked.clear();
  clock.keep = keep;
  clock.layer = null;
}
function warpT(W, x) {
  if (x <= W[0][0]) return x;
  for (let k = 1; k < W.length; k++) {
    if (x <= W[k][0]) {
      const [a, b] = W[k - 1],
        [c, d] = W[k];
      return b + ((x - a) / (c - a)) * (d - b);
    }
  }
  const [a, b] = W[W.length - 1];
  return b + (x - a);
}
export async function loadVideo(clip) {
  if (_vids[clip]) return _vids[clip];
  const meta = await (await fetch(`/assets/video/${clip}/meta.json`)).json();
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  const cache = new Map();
  const get = async (i) => {
    i = Math.max(1, Math.min(meta.n, i));
    if (cache.has(i)) return cache.get(i);
    const p = fetch(
      `/assets/video/${clip}/f_${String(i).padStart(5, "0")}.${meta.ext ?? "jpg"}`,
    )
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b, { imageOrientation: "flipY" }));
    cache.set(i, p);
    if (cache.size > 90) {
      const k = cache.keys().next().value;
      cache.delete(k);
    }
    return p;
  };
  const v = {
    name: clip,
    meta,
    tex,
    cur: -1,
    // localT seconds into the clip -> updates tex. returns frame index.
    async frame(localT) {
      v.prepared = clock.id;
      if (meta.warp) localT = warpT(meta.warp, localT);
      const i = Math.max(
        1,
        Math.min(meta.n, Math.floor(localT * meta.fps) + 1),
      );
      if (i !== v.cur) {
        const jobs = [get(i)];
        if (meta.mask) jobs.push(getM(i));
        const [im, mm] = await Promise.all(jobs);
        v.tex.image = im;
        v.tex.needsUpdate = true;
        if (mm) {
          v.mtex.image = mm;
          v.mtex.needsUpdate = true;
        }
        v.cur = i;
        get(i + 1);
        if (meta.mask) getM(i + 1);
      }
      v.i = i;
      return i;
    },
    // tracking (tools/track.py): pose = 33 MediaPipe landmarks [x,y,vis] in video UV (0..1, y down); box = matte bbox [x0,y0,x1,y1]; c = matte centroid
    // Inside a motion-blur sample it returns what the same layer's frame pass got, so tracked graphics stay on the
    // footage frame shown.
    trackAt(localT) {
      if (!v.track) return null;
      const L = clock.layer,
        seen = L == null ? null : v._seen?.get(L);
      if (clock.sub && seen) {
        if (v._pass !== clock.pass || v._layer !== L) {
          v._pass = clock.pass;
          v._layer = L;
          v._k = 0;
        }
        const i = replayIndex(seen, v._k++, localT, clock.shift);
        if (i !== null) return v.track[i];
      }
      const arg = localT;
      if (meta.warp) localT = warpT(meta.warp, localT);
      const i = Math.max(
        0,
        Math.min(v.track.length - 1, Math.floor(localT * meta.fps)),
      );
      if (clock.keep && !clock.sub && L != null) {
        v._seen ??= new Map();
        if (!v._seen.has(L)) v._seen.set(L, []);
        v._seen.get(L).push([arg, i]);
        _tracked.add(v);
      }
      return v.track[i];
    },
  };
  // matte sequence (tools/matte): /assets/video/<clip>/m_00001.png (white = subject)
  const mcache = new Map();
  const getM = async (i) => {
    i = Math.max(1, Math.min(meta.n, i));
    if (mcache.has(i)) return mcache.get(i);
    const p = fetch(`/assets/video/${clip}/m_${String(i).padStart(5, "0")}.png`)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b, { imageOrientation: "flipY" }));
    mcache.set(i, p);
    if (mcache.size > 90) {
      const k = mcache.keys().next().value;
      mcache.delete(k);
    }
    return p;
  };
  v.mtex = new THREE.Texture();
  v.mtex.colorSpace = THREE.NoColorSpace;
  v.mtex.minFilter = THREE.LinearFilter;
  v.mtex.generateMipmaps = false;
  v.mtex.flipY = false;
  if (meta.track) {
    try {
      v.track = await (await fetch(`/assets/video/${clip}/track.json`)).json();
    } catch (e) {
      v.track = null;
    }
  }
  _vids[clip] = v;
  return v;
}

export const col = (hex, mul = 1) => new THREE.Color(hex).multiplyScalar(mul);
