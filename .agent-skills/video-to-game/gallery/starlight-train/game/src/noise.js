// Deterministic helpers shared by CPU (placement, physics) and GPU (shaders).
// The integer hash below is bit-identical to the GLSL version in shaders.js.

export function ihash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return h >>> 0;
}
export function h01(x, y) { return (ihash(x, y) & 16777215) / 16777215; }

export function vnoise(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h01(ix, iy), b = h01(ix + 1, iy), c = h01(ix, iy + 1), d = h01(ix + 1, iy + 1);
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Height of the snowy ground in "train space": xw = x + scroll (world-scrolled), z = across the track.
// z < 0 : the hillside rising behind the train ; z > 0 : the valley slope toward the camera.
export const TERR = { passX0: 1e7 };   // world x where the high pass (steeper slopes) begins
export function terrainH(xw, z) {
  const pk = smooth(TERR.passX0, TERR.passX0 + 90, xw);
  const far = Math.max(0, -z - 3.4);
  const nr = Math.max(0, z - 3.4);
  const vary = 0.78 + 0.22 * Math.sin(xw * 0.0123 + 1.3) + 0.10 * Math.sin(xw * 0.041 + 0.4);
  // embankment rising behind the track to a ridge, then falling away so the far mountains show
  const hFar = (5.2 * (1 - Math.exp(-far / 5.0)) - Math.max(0, far - 13) * 0.55) * vary + pk * (4.0 * (1 - Math.exp(-far / 6.0)) + Math.max(0, far - 30) * 0.18);
  const hNear = (-nr * (0.26 + 0.07 * Math.sin(xw * 0.019)) - nr * nr * 0.0035) * (1 + pk * 0.9);
  const n1 = vnoise(xw * 0.045, z * 0.05) * 2 - 1;
  const n2 = vnoise(xw * 0.13 + 17.0, z * 0.13 + 5.0) * 2 - 1;
  const amp = smooth(3.4, 10.0, Math.abs(z));
  const h = hFar + hNear + (n1 * 2.0 + n2 * 0.55) * amp;
  const bed = 1 - smooth(2.6, 3.4, Math.abs(z));
  const drift = Math.max(0, vnoise(xw * 0.35, z * 0.6) - 0.45) * 0.35;
  return h + bed * drift;
}

// Small seeded RNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = smooth;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
