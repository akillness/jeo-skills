// Deterministic value noise + the Emberhollow colour script.
// Art direction: "lantern-lit papercraft at dusk" — faceted, matte, jewel-toned
// paper stock lit by warm ember light against a cold indigo night.

import * as THREE from 'three';

/** Small deterministic PRNG (mulberry32) so the village looks identical every load. */
export function makeRng(seed = 1337) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smooth(t) { return t * t * (3 - 2 * t); }

/** Classic 2D value noise in [-1, 1]. */
export function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return (top + (bot - top) * v) * 2 - 1;
}

/** Fractal brownian motion over value noise. */
export function fbm(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The full colour script. Every material in the village pulls from here. */
export const PALETTE = {
  nightTop: 0x120b26,
  nightHorizon: 0x3d2a57,
  nightGlow: 0xff9a4d,
  fog: 0x241635,

  grassLow: 0x2f7d63,
  grassHigh: 0x46a37a,
  moss: 0x1d5b4c,
  sand: 0xd8b98a,
  rock: 0x5a4a6b,
  rockHigh: 0x8b7aa3,
  snow: 0xf1e7d8,
  water: 0x1f4f7a,

  paperWall: 0xf0dfc0,
  paperWarm: 0xe6c79a,
  timber: 0x6b4630,
  timberDark: 0x40291d,
  roofPlum: 0x7c3a58,
  roofTeal: 0x2c6b74,
  roofOchre: 0xc9762f,
  roofIndigo: 0x3d4380,
  thatch: 0xb98c4a,
  stone: 0x6d6480,
  ember: 0xffb35c,
  emberDeep: 0xff7a2f,
  jade: 0x6fe0c0,
  mushroomCap: 0xd0523f,
  mushroomStem: 0xf3e2c7,
  leafDeep: 0x1f6b57,
  leafLight: 0x39a37e,
  leafPink: 0xd98cae,
  cloth: 0xb2405e
};

/** Matte, flat-shaded paper stock. Each call returns a fresh material so a
 *  selected building can glow without lighting up its neighbours. */
export function paperMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.92,
    metalness: 0,
    flatShading: options.flatShading ?? true,
    emissive: new THREE.Color(0x000000),
    ...options.extra
  });
}

/** Self-lit material for lanterns, windows and wisps. */
export function glowMaterial(color, intensity = 1.0) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 1,
    metalness: 0,
    flatShading: true
  });
}
