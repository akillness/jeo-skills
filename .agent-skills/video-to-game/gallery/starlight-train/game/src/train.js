import * as THREE from 'three';
import { U, BEND, patchBend } from './shaders.js';

export const N_WAGONS = 6;
export const WAGON_LEN = 12.0;
export const SPACING = 13.6;
export const RAIL_Y = 0.12;
const X0 = SPACING * (N_WAGONS - 1) / 2;   // wagon 0 (front) center
export const wagonCenter = (i) => X0 - i * SPACING;

// Rasterise the top surface of a mesh into a height grid (max y per cell), in scaled local space.
function bakeHeightmap(geo, scale, yOffset, nx = 240, nz = 48) {
  const pos = geo.getAttribute('position');
  const idx = geo.index ? geo.index.array : null;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const minX = bb.min.x, maxX = bb.max.x, minZ = bb.min.z, maxZ = bb.max.z;
  const H = new Float32Array(nx * nz).fill(-1e9);
  const gx = (x) => (x - minX) / (maxX - minX) * (nx - 1);
  const gz = (z) => (z - minZ) / (maxZ - minZ) * (nz - 1);
  const triCount = idx ? idx.length / 3 : pos.count / 3;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) { const vi = idx ? idx[t * 3 + k] : t * 3 + k; v[k].fromBufferAttribute(pos, vi); }
    const ax = gx(v[0].x), az = gz(v[0].z), bx = gx(v[1].x), bz = gz(v[1].z), cx = gx(v[2].x), cz = gz(v[2].z);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(nx - 1, Math.ceil(Math.max(ax, bx, cx)));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz, cz))), z1 = Math.min(nz - 1, Math.ceil(Math.max(az, bz, cz)));
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-9) continue;
    for (let zi = z0; zi <= z1; zi++) for (let xi = x0; xi <= x1; xi++) {
      const w0 = ((bz - cz) * (xi - cx) + (cx - bx) * (zi - cz)) / den;
      const w1 = ((cz - az) * (xi - cx) + (ax - cx) * (zi - cz)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const y = w0 * v[0].y + w1 * v[1].y + w2 * v[2].y;
      const id = zi * nx + xi;
      if (y > H[id]) H[id] = y;
    }
  }
  // fill tiny holes, then scale to world units
  const out = new Float32Array(nx * nz);
  for (let zi = 0; zi < nz; zi++) for (let xi = 0; xi < nx; xi++) {
    let h = H[zi * nx + xi];
    if (h < -1e8) {
      let best = -1e9;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const a = xi + dx, b = zi + dz; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        best = Math.max(best, H[b * nx + a]);
      }
      h = best;
    }
    out[zi * nx + xi] = h < -1e8 ? -1e9 : h * scale + yOffset;
  }
  // light 3x3 smoothing of the roof surface
  const sm = new Float32Array(nx * nz);
  for (let zi = 0; zi < nz; zi++) for (let xi = 0; xi < nx; xi++) {
    let s = 0, n = 0; const c = out[zi * nx + xi];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = xi + dx, b = zi + dz; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const h = out[b * nx + a]; if (Math.abs(h - c) < 0.5) { s += h; n++; }
    }
    sm[zi * nx + xi] = n ? s / n : c;
  }
  return { H: sm, nx, nz, minX: minX * scale, maxX: maxX * scale, minZ: minZ * scale, maxZ: maxZ * scale };
}

function sampleHM(hm, lx, lz) {
  const fx = (lx - hm.minX) / (hm.maxX - hm.minX) * (hm.nx - 1);
  const fz = (lz - hm.minZ) / (hm.maxZ - hm.minZ) * (hm.nz - 1);
  if (fx < 0 || fz < 0 || fx > hm.nx - 1 || fz > hm.nz - 1) return -1e9;
  const x0 = Math.floor(fx), z0 = Math.floor(fz), x1 = Math.min(x0 + 1, hm.nx - 1), z1 = Math.min(z0 + 1, hm.nz - 1);
  const tx = fx - x0, tz = fz - z0;
  const a = hm.H[z0 * hm.nx + x0], b = hm.H[z0 * hm.nx + x1], c = hm.H[z1 * hm.nx + x0], d = hm.H[z1 * hm.nx + x1];
  const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d);
  if (mx - mn > 0.6) return [a, b, c, d][Math.round(tz) * 2 + Math.round(tx)];  // don't blend across an edge
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// Window-aware carriage material: warm interior texels light up progressively with uLit (0..1 along the car).
function wagonMaterial(map, bounds) {
  const m = new THREE.MeshLambertMaterial({ map, color: 0xffffff });
  const u = { uLit: { value: 0 }, uFlash: { value: 0 }, uXMin: { value: bounds.min.x }, uXLen: { value: bounds.max.x - bounds.min.x }, uSide: { value: 1.0 },
    uYMin: { value: bounds.min.y }, uYLen: { value: bounds.max.y - bounds.min.y } };
  m.userData.u = u;
  patchBend(m, 'wagon', (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal; varying float vUpL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position; vUpL = normal.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uLit; uniform float uFlash; uniform float uXMin; uniform float uXLen; uniform float uTime;
        uniform float uYMin; uniform float uYLen;
        varying vec3 vLocal; varying float vUpL;
        float gWin; vec3 gBase; float gOn; vec3 gBody;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 tc = diffuseColor.rgb;
          vec3 sc = pow(max(tc, vec3(0.0)), vec3(0.4545));
          float warm = smoothstep(0.07, 0.19, sc.r - sc.b) * smoothstep(0.01, 0.09, sc.g - sc.b) * smoothstep(0.33, 0.52, sc.r);
          float u = (vLocal.x - uXMin) / uXLen;
          float on = smoothstep(u - 0.025, u + 0.025, uLit);
          gWin = warm; gBase = tc; gOn = on;
          vec3 dark = vec3(0.012, 0.018, 0.028) + tc * 0.03;
          // richer lacquered body: deeper burgundy / bottle green, like the reference
          float bl = dot(tc, vec3(0.3, 0.59, 0.11));
          vec3 body = mix(vec3(bl), tc, 1.35) * 0.92;
          diffuseColor.rgb = mix(body, mix(dark, tc * 1.1, on), warm);
          // thick fresh snow on the roof: bright and nearly neutral, like the painted reference
          float lumS = dot(sc, vec3(0.3, 0.59, 0.11));
          float snow = smoothstep(0.55, 0.75, lumS) * (1.0 - smoothstep(0.08, 0.2, max(sc.r, max(sc.g, sc.b)) - min(sc.r, min(sc.g, sc.b))));
          float yU = (vLocal.y - uYMin) / uYLen;
          float roof = smoothstep(0.80, 0.86, yU) * smoothstep(0.05, 0.45, vUpL);
          snow = max(snow, roof) * (1.0 - warm);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.84, 0.86) * (0.92 + 0.12 * lumS), snow * 0.9);
          gBody = body * (1.0 - snow) * (1.0 - warm);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gBody * 0.22;   // lacquer keeps its colour on the shaded side
        totalEmissiveRadiance += (gBase * 0.7 + vec3(0.30, 0.17, 0.05)) * gWin * gOn * (3.0 + uFlash * 3.0) * vec3(1.0, 0.80, 0.55);`);
  });
  return m;
}

const BEAM_V = BEND + `
  attribute float aU; attribute vec2 aQ;
  varying float vU; varying vec2 vQ;
  void main(){
    vU = aU; vQ = aQ;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    wp.xyz = bendW(wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const BEAM_F = `
  uniform float uLit; uniform float uTime; uniform float uFlash;
  varying float vU; varying vec2 vQ;
  void main(){
    float on = smoothstep(vU - 0.07, vU + 0.01, uLit);
    float side = 1.0 - abs(vQ.x);
    float a = pow(clamp(side, 0.0, 1.0), 1.6) * pow(clamp(1.0 - vQ.y, 0.0, 1.0), 1.3) * smoothstep(0.0, 0.08, vQ.y) * on;
    float motes = 0.8 + 0.2 * sin(uTime * 1.7 + vQ.y * 9.0 + vU * 40.0);
    gl_FragColor = vec4(vec3(1.0, 0.66, 0.30) * a * 0.20 * motes * (1.0 + uFlash), 0.0);
  }`;

export function buildTrain(scene, glb) {
  const train = { wagons: [], roofTop: 0, group: new THREE.Group() };
  scene.add(train.group);
  const types = {};
  for (const key of ['green', 'red']) {
    const src = glb[key].scene;
    let mesh = null; src.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox.clone();
    const scale = WAGON_LEN / (bb.max.x - bb.min.x);
    const yOff = RAIL_Y - bb.min.y * scale;
    const hm = bakeHeightmap(geo, scale, yOff);
    types[key] = { geo, map: mesh.material.map, bb, scale, yOff, hm };
  }
  const pattern = ['red', 'green', 'green', 'red', 'green', 'red'];
  let roofTop = 0;
  for (let i = 0; i < N_WAGONS; i++) {
    const T = types[pattern[i]];
    if (T.map) { T.map.colorSpace = THREE.SRGBColorSpace; T.map.anisotropy = 8; }
    const mat = wagonMaterial(T.map, T.bb);
    const mesh = new THREE.Mesh(T.geo, mat);
    mesh.scale.setScalar(T.scale);
    mesh.position.set(wagonCenter(i), T.yOff, 0);
    mesh.frustumCulled = false;
    train.group.add(mesh);
    // roof extents from the height map
    let top = -1e9; for (const h of T.hm.H) top = Math.max(top, h);
    roofTop = Math.max(roofTop, top);
    // light shafts (near side), one quad per window
    const beam = makeBeams();
    beam.position.set(wagonCenter(i), 0, 0);
    train.group.add(beam);
    train.wagons.push({ i, type: pattern[i], mesh, mat, hm: T.hm, x: wagonCenter(i), lit: 0, frac: 0, flash: 0, beam, bob: Math.random() * 6 });
  }
  train.roofTop = roofTop;
  // walkable half-length of each roof (where the roof surface is within 0.5 of the top)
  const hm0 = types.green.hm;
  let minL = 1e9, maxL = -1e9;
  for (let xi = 0; xi < hm0.nx; xi++) {
    const lx = hm0.minX + (hm0.maxX - hm0.minX) * xi / (hm0.nx - 1);
    const h = sampleHM(hm0, lx, 0);
    if (h > roofTop - 0.5) { minL = Math.min(minL, lx); maxL = Math.max(maxL, lx); }
  }
  train.roofMin = minL; train.roofMax = maxL;

  // locomotive (model faces +z, rotate to face +x)
  {
    const src = glb.loco.scene; let mesh = null; src.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    const geo = mesh.geometry; geo.computeBoundingBox(); const bb = geo.boundingBox;
    const scale = 4.25 / (bb.max.y - bb.min.y);
    const len = (bb.max.z - bb.min.z) * scale;
    const map = mesh.material.map; if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; }
    const mat = new THREE.MeshLambertMaterial({ map });
    patchBend(mat, 'loco', (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nfloat gLamp; vec3 gLB;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          { vec3 sc = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.4545));
            gLamp = clamp((sc.r - sc.b - 0.2) * 4.0, 0.0, 1.0) * smoothstep(0.5, 0.75, sc.r) * clamp((sc.g - sc.b - 0.1) * 5.0, 0.0, 1.0);
            gLB = diffuseColor.rgb; }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gLB * gLamp * 2.2;');
    });
    const loco = new THREE.Mesh(geo, mat);
    loco.scale.setScalar(scale);
    loco.rotation.y = Math.PI / 2;
    const cx = wagonCenter(0) + WAGON_LEN / 2 + 1.6 + len / 2;
    // rotation.y = +90deg maps model z -> world x and model x -> world -z
    loco.position.set(cx - ((bb.min.z + bb.max.z) / 2) * scale, RAIL_Y - bb.min.y * scale, ((bb.min.x + bb.max.x) / 2) * scale);
    loco.frustumCulled = false;
    train.group.add(loco);
    train.loco = { mesh: loco, x: cx, len, scale, bb,
      chimney: new THREE.Vector3(cx + len * 0.27, RAIL_Y + (bb.max.y - bb.min.y) * scale * 0.98, 0),
      lamp: new THREE.Vector3(cx + len * 0.47, RAIL_Y + (bb.max.y - bb.min.y) * scale * 0.66, 0) };
  }
  train.front = train.loco.x + train.loco.len / 2;
  train.rear = wagonCenter(N_WAGONS - 1) - WAGON_LEN / 2;

  // couplings between cars (small dark bars at buffer height)
  const cMat = patchBend(new THREE.MeshLambertMaterial({ color: 0x1d2026 }), 'coupling');
  for (let i = 0; i < N_WAGONS; i++) {
    const x = wagonCenter(i) + SPACING / 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(SPACING - WAGON_LEN + 0.4, 0.16, 0.22), cMat);
    bar.position.set(x, 1.05, 0); train.group.add(bar);
  }

  train.groundAt = (x, z) => {
    let best = -1e9, wi = -1;
    for (const w of train.wagons) {
      const lx = x - w.x;
      if (lx < w.hm.minX - 0.1 || lx > w.hm.maxX + 0.1) continue;
      const h = sampleHM(w.hm, lx, z) + w.dy;
      if (h > best) { best = h; wi = w.i; }
    }
    return { h: best, w: wi };
  };
  train.wagonAt = (x) => {
    let wi = -1, d = 1e9;
    for (const w of train.wagons) { const dd = Math.abs(x - w.x); if (dd < d) { d = dd; wi = w.i; } }
    return wi;
  };
  for (const w of train.wagons) w.dy = 0;
  return train;
}

function makeBeams() {
  // window centres along the car (fraction of length), see README: measured on the generated carriage
  const W = [0.08, 0.207, 0.324, 0.439, 0.556, 0.673, 0.79, 0.917];
  const pos = [], aU = [], aQ = [], idx = [];
  let v = 0;
  for (let j = 0; j < W.length; j++) {
    const x = (W[j] - 0.5) * WAGON_LEN;
    const hw = (j === 0 || j === 7) ? 0.26 : 0.46;
    const top = 3.15, bot = 2.2, z0 = 1.56;
    // quad from the window opening down/outward to the snow
    const quad = [
      [x - hw, top, z0], [x + hw, top, z0], [x - hw - 0.25 + 0.5, 0.05, 5.6], [x + hw + 0.25 + 0.5, 0.05, 5.6],
    ];
    const q = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (let k = 0; k < 4; k++) { pos.push(...quad[k]); aU.push(W[j]); aQ.push(...q[k]); }
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
    void bot;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(aQ, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLit: { value: 0 }, uTime: U.uTime, uFlash: { value: 0 }, uBendK: U.uBendK, uBendX0: U.uBendX0 },
    vertexShader: BEAM_V, fragmentShader: BEAM_F,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.renderOrder = 15;
  return m;
}

export function updateTrain(train, dt, time) {
  for (const w of train.wagons) {
    const target = w.lit / 3;
    w.frac += (target - w.frac) * Math.min(1, dt * 1.6);
    if (Math.abs(target - w.frac) < 0.002) w.frac = target;
    w.flash = Math.max(0, w.flash - dt * 1.4);
    w.mat.userData.u.uLit.value = w.frac;
    w.mat.userData.u.uFlash.value = w.flash;
    w.beam.material.uniforms.uLit.value = w.frac;
    w.beam.material.uniforms.uFlash.value = w.flash;
    // gentle rocking of the cars (visual + roof height)
    w.dy = Math.sin(time * 5.1 + w.bob) * 0.025 + Math.sin(time * 1.3 + w.bob * 2.0) * 0.02;
    w.mesh.position.y = w.baseY ?? (w.baseY = w.mesh.position.y);
    w.mesh.position.y = w.baseY + w.dy;
    w.mesh.rotation.x = Math.sin(time * 1.1 + w.bob) * 0.006;
    U.uWagonX.value[w.i] = w.x;
    U.uWagonLit.value[w.i] = w.frac;
  }
  const l = train.loco.mesh;
  l.position.y = (l.userData.baseY ?? (l.userData.baseY = l.position.y)) + Math.sin(time * 6.3) * 0.02;
}
