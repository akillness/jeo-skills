// Shared materials built from the fal-generated textures, plus a few geometry helpers.
import * as THREE from 'three';

let T = null;
const cache = new Map();

export function initMaterials(tex) { T = tex; cache.clear(); }

function repeatTex(t, rx, ry = rx) {
  if (!t) return null;
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

/** Polished brass. scale = texture repeats per world unit. */
export function brass({ scale = 0.2, rough = 0.3, tint = 0xffffff, env = 1.25, key = '' } = {}) {
  const k = `brass|${scale}|${rough}|${tint}|${env}|${key}`;
  if (cache.has(k)) return cache.get(k);
  const map = repeatTex(T.brass, scale);
  const m = new THREE.MeshStandardMaterial({
    map, color: tint, metalness: 1.0, roughness: rough,
    bumpMap: map, bumpScale: 0.9, envMapIntensity: env,
  });
  cache.set(k, m);
  return m;
}

export function stone({ scale = 0.16, tint = 0xffffff, rough = 0.9 } = {}) {
  const k = `stone|${scale}|${tint}|${rough}`;
  if (cache.has(k)) return cache.get(k);
  const map = repeatTex(T.stone, scale);
  const m = new THREE.MeshStandardMaterial({ map, color: tint, roughness: rough, metalness: 0.0, bumpMap: map, bumpScale: 1.6, envMapIntensity: 0.35 });
  cache.set(k, m);
  return m;
}

export function wood({ scale = 0.22, tint = 0xffffff, rough = 0.62 } = {}) {
  const k = `wood|${scale}|${tint}|${rough}`;
  if (cache.has(k)) return cache.get(k);
  const map = repeatTex(T.wood, scale);
  const m = new THREE.MeshStandardMaterial({ map, color: tint, roughness: rough, metalness: 0.0, bumpMap: map, bumpScale: 0.6, envMapIntensity: 0.45 });
  cache.set(k, m);
  return m;
}

export function floorInlay({ tile = 3.2 } = {}) {
  const k = `floor|${tile}`;
  if (cache.has(k)) return cache.get(k);
  const map = repeatTex(T.floor, 1 / tile);
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.28, metalness: 0.0, envMapIntensity: 0.9 });
  cache.set(k, m);
  return m;
}

/**
 * Box geometry whose UVs are in world units (so tiled textures keep a constant density).
 * Face order (BoxGeometry): +x, -x, +y, -y, +z, -z.
 */
export function worldBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0], uv.getY(idx) * dims[f][1]);
    }
  }
  return g;
}

/** Shift the world-UVs of a worldBox so neighbouring boxes do not repeat the same texture spot. */
export function offsetUV(g, ox, oy) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ox, uv.getY(i) + oy);
  return g;
}

/** Soft round sprite texture used by particles (a rendering effect, not artwork). */
let _dot = null;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  _dot.colorSpace = THREE.SRGBColorSpace;
  return _dot;
}
