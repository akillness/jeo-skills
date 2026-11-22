import * as THREE from 'three';
import { foliageMaterial } from './shaders.js';
import { clamp, lerp } from './noise.js';
import { N_WAGONS } from './train.js';
import { PH } from './player.js';

const WARM = [1.0, 0.86, 0.55];
const STAR_SIZE = 1.75;   // falling star sprite (world units), big and golden like the reference

// ------------------------------------------------------------------ particles helpers
export function makeFx(B) {
  return {
    sparkBurst(x, y, z, n = 18, speed = 4, col = WARM, size = 0.5) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
        const s = speed * (0.4 + Math.random() * 0.8);
        B.spark.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 1.2, vz: Math.sin(a) * Math.cos(e) * s,
          life: 0.6 + Math.random() * 0.8, size: size * (0.6 + Math.random() * 0.8), size1: 0.05, r: col[0], g: col[1], b: col[2], a: 1.0, a1: 0.0,
          frame: Math.floor(Math.random() * 4), drag: 2.2, grav: 2.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6 });
      }
    },
    puffRing(x, y, z, n = 7, r0 = 0.25, size = 0.55, alpha = 0.55) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        B.puff.spawn({ x: x + Math.cos(a) * r0, y: y + 0.08, z: z + Math.sin(a) * r0, vx: Math.cos(a) * 1.6, vy: 0.5 + Math.random() * 0.5, vz: Math.sin(a) * 1.6,
          life: 0.55 + Math.random() * 0.3, size: size * 0.6, size1: size * 1.4, r: 0.93, g: 0.96, b: 1.0, a: alpha, a1: 0, drag: 3.5, rot: Math.random() * 6 });
      }
    },
    kick(x, y, z, vx) {
      B.puff.spawn({ x, y: y + 0.06, z, vx: -vx * 0.15 + (Math.random() - 0.5) * 0.6, vy: 0.5 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.6,
        life: 0.45, size: 0.18, size1: 0.45, r: 0.92, g: 0.95, b: 1.0, a: 0.4, a1: 0, drag: 2.5, rot: Math.random() * 6 });
    },
    footprint(x, y, z, ang) {
      B.disc.spawn({ x, y: y + 0.03, z, life: 7.0, size: 1, sx: 0.12, sy: 0.19, rot: -ang, r: 0.32, g: 0.40, b: 0.55, a: 0.32, a1: 0.0 });
    },
  };
}

// ------------------------------------------------------------------ falling stars
export class Stars {
  constructor(B, fx, train, lights) {
    this.B = B; this.fx = fx; this.train = train; this.lights = lights; this.list = []; this.id = 0;
  }
  clear() {
    for (const s of this.list) this.release(s);
    this.list.length = 0;
  }
  release(s) {
    for (const p of [s.pStar, s.pGlow, s.pThread, s.pRing]) if (p) { p.keep = false; p.age = p.life = 0; }
    if (s.light) { s.light.intensity = 0; s.light.userData.busy = false; s.light = null; }
  }
  spawn({ w, lx, z, T = 6, kind = 'star', height = 15 }) {
    const train = this.train;
    const wx = train.wagons[w].x;
    const g = train.groundAt(wx + lx, z).h;
    const yEnd = (g > -1e8 ? g : train.roofTop) + 0.42;
    const s = { id: ++this.id, kind, w, lx, z, x: wx + lx, y: yEnd + height, y0: yEnd + height, yEnd, t: 0, T, state: 'fall', ph: Math.random() * 6, hover: 0, trailT: 0 };
    if (kind === 'shoot') {
      s.p0 = new THREE.Vector3(wx + lx + 70, train.roofTop + 38, -55);
      s.p1 = new THREE.Vector3(wx + lx + 20, train.roofTop + 26, -12);
      s.p2 = new THREE.Vector3(wx + lx, train.roofTop + 3.0, z);
      s.flyT = 1.7; s.T = 4.2;
      s.x = s.p0.x; s.y = s.p0.y; s.zz = s.p0.z;
    }
    const big = kind === 'shoot' ? 1.35 : 1.0;
    s.pStar = this.B.star.spawn({ x: s.x, y: s.y, z: s.zz ?? z, keep: true, life: 1, size: STAR_SIZE * big, r: 2.3, g: 2.0, b: 1.0, a: 1.0, a1: 1.0, fadeIn: 0.4 });
    s.pGlow = this.B.spark.spawn({ x: s.x, y: s.y, z: s.zz ?? z, keep: true, life: 1, size: 3.4 * big, frame: 1, r: 1.0, g: 0.70, b: 0.32, a: 0.20, a1: 0.20, fadeIn: 0.4 });
    s.pThread = this.B.thread.spawn({ x: s.x, y: s.y, z: s.zz ?? z, keep: true, life: 1, size: 1, sx: 0.26, sy: 22, r: 1.0, g: 0.78, b: 0.42, a: kind === 'shoot' ? 0 : 0.6, a1: 0.6, fadeIn: 0.8 });
    s.pRing = this.B.ring.spawn({ x: s.x, y: yEnd - 0.38, z, keep: true, life: 1, size: 1.9, r: 1.0, g: 0.82, b: 0.5, a: 0, a1: 0 });
    const L = this.lights.find((l) => !l.userData.busy);
    if (L) { L.userData.busy = true; s.light = L; }
    this.list.push(s);
    return s;
  }
  activeCount() { return this.list.filter((s) => s.state === 'fall' || s.state === 'fly' || s.state === 'hover').length; }
  // returns events: {type:'catch'|'miss', star}
  update(dt, P, time, out) {
    for (const s of this.list) {
      s.t += dt;
      if (s.state === 'fall') {
        if (s.kind === 'shoot') {
          // fly along a curve, then hover above the roof
          const u = Math.min(1, s.t / s.flyT);
          const e = 1 - Math.pow(1 - u, 2.2);
          const a = s.p0, b = s.p1, c = s.p2;
          s.x = (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * b.x + e * e * c.x;
          s.y = (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * b.y + e * e * c.y;
          s.zz = (1 - e) * (1 - e) * a.z + 2 * (1 - e) * e * b.z + e * e * c.z;
          s.trailT += dt;
          while (s.trailT > 0.012) {
            s.trailT -= 0.012;
            this.B.spark.spawn({ x: s.x + (Math.random() - 0.5) * 0.3, y: s.y + (Math.random() - 0.5) * 0.3, z: s.zz, vx: 0, vy: -0.3, vz: 0, life: 0.9 + Math.random() * 0.5,
              size: 0.9, size1: 0.1, r: 1, g: 0.85, b: 0.6, a: 0.9, a1: 0, frame: Math.random() < 0.5 ? 0 : 3, rot: Math.random() * 6 });
          }
          if (u >= 1) { s.kind = 'shoot-hover'; s.t = 0; s.y0 = s.y; s.yEnd = s.p2.y - 2.55; s.T = 4.6; }
        } else {
          const u = clamp(s.t / s.T, 0, 1);
          const wob = Math.sin(time * 1.7 + s.ph) * 0.18 * (1 - u);
          const wx = this.train.wagons[s.w].x;
          s.x = wx + s.lx + wob;
          s.zz = s.z + Math.cos(time * 1.3 + s.ph) * 0.12 * (1 - u);
          if (s.kind === 'shoot-hover') s.y = s.y0 + (s.yEnd - s.y0) * Math.pow(u, 2.2) + Math.sin(time * 3 + s.ph) * 0.12;
          else s.y = s.y0 + (s.yEnd - s.y0) * (0.25 * u + 0.75 * u * u * (3 - 2 * u));
          if (u >= 1) { s.state = 'miss'; s.t = 0; out.push({ type: 'miss', star: s }); }
          // falling sparkles along the thread
          if (Math.random() < dt * 9) {
            this.B.spark.spawn({ x: s.x + (Math.random() - 0.5) * 0.15, y: s.y + 0.6 + Math.random() * 7, z: s.zz, vy: -1.2 - Math.random(), life: 1.2, size: 0.28, size1: 0.05,
              r: 1, g: 0.86, b: 0.6, a: 0.9, a1: 0, frame: 0, rot: Math.random() * 6 });
          }
        }
        // catch test
        if (s.state === 'fall' && (P.state === 'play' || P.state === 'stun')) {
          const dx = s.x - P.x, dy = s.y - (P.y + 0.55), dz = (s.zz ?? s.z) - P.z;
          if (dx * dx + dy * dy + dz * dz < PH.CATCH_R * PH.CATCH_R) {
            s.state = 'caught'; s.t = 0; out.push({ type: 'catch', star: s });
          }
        }
      }
      // visuals
      const z = s.zz ?? s.z;
      const pulse = 1 + Math.sin(time * 6 + s.ph) * 0.06;
      if (s.state === 'fall') {
        s.pStar.x = s.x; s.pStar.y = s.y; s.pStar.z = z; s.pStar.rot = Math.sin(time * 1.5 + s.ph) * 0.3; s.pStar.size = s.pStar.size1 = STAR_SIZE * (s.kind.startsWith('shoot') ? 1.3 : 1.0) * pulse;
        s.pGlow.x = s.x; s.pGlow.y = s.y; s.pGlow.z = z;
        s.pThread.x = s.x; s.pThread.y = s.y + 0.25; s.pThread.z = z;
        const near = clamp(1 - (s.y - s.yEnd) / 9, 0, 1);
        const ta = s.kind === 'star' ? 0.55 * (1 - near * 0.5) : (s.kind === 'shoot-hover' ? 0.4 : 0);
        s.pThread.a = s.pThread.a1 = ta;
        s.pRing.x = s.kind === 'star' ? s.x : (s.p2 ? s.p2.x : s.x); s.pRing.z = s.kind === 'star' ? s.z : s.z;
        if (s.kind === 'star') s.pRing.x = this.train.wagons[s.w].x + s.lx;
        else if (s.kind === 'shoot-hover') s.pRing.x = this.train.wagons[s.w].x + s.lx;
        s.pRing.a = s.pRing.a1 = (s.kind === 'shoot' ? 0 : (0.35 + near * 0.65)) * (0.75 + 0.25 * Math.sin(time * 7 + s.ph));
        s.pRing.size = s.pRing.size1 = 1.5 + 0.35 * Math.sin(time * 4 + s.ph);
        if (s.light) {
          s.light.position.set(s.x, s.y + 0.2, z);
          s.light.intensity = lerp(s.light.intensity, 2 + near * 5, Math.min(1, dt * 4));
        }
      } else {
        // fade out quickly after catch/miss
        s.pStar.a = s.pStar.a1 = Math.max(0, 1 - s.t * 4);
        s.pGlow.a = s.pGlow.a1 = Math.max(0, 0.5 - s.t * 2);
        s.pThread.a = s.pThread.a1 = Math.max(0, s.pThread.a - dt * 3);
        s.pRing.a = s.pRing.a1 = Math.max(0, s.pRing.a - dt * 3);
        if (s.light) s.light.intensity = Math.max(0, s.light.intensity - dt * 60);
        if (s.t > 0.6) s.dead = true;
      }
    }
    for (const s of this.list) if (s.dead) this.release(s);
    this.list = this.list.filter((s) => !s.dead);
  }
}

// ------------------------------------------------------------------ overhanging snowy boughs (pine forest leg)
export class Boughs {
  constructor(scene, glb, pineGeo, pineMat, B) {
    let src = null; glb.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    this.geo = src.geometry; this.geo.computeBoundingBox();
    const map = src.material.map; if (map) map.colorSpace = THREE.SRGBColorSpace;
    this.mat = foliageMaterial(map, 'bough');
    this.pineGeo = pineGeo; this.pineMat = pineMat;
    this.scene = scene; this.B = B; this.list = [];
  }
  clear() { for (const b of this.list) { this.scene.remove(b.group); if (b.shadow) b.shadow.keep = false, b.shadow.life = 0; } this.list.length = 0; }
  spawn(x, roofTop, tipZ, groundY) {
    const g = new THREE.Group();
    const bb = this.geo.boundingBox;
    const len = tipZ + 4.2;                      // from the trunk (z=-4.2) to tipZ
    const m = new THREE.Mesh(this.geo, this.mat);
    const sz = len / (bb.max.z - bb.min.z), sx = 2.0 / (bb.max.x - bb.min.x), sy = 0.9 / (bb.max.y - bb.min.y);
    m.scale.set(sx, sy, sz);
    m.rotation.y = Math.PI;                      // broken stub towards the trunk (far side)
    m.position.set(0, roofTop + 0.30 - bb.min.y * sy, (-4.2 + tipZ) / 2);
    m.frustumCulled = false;
    const tree = new THREE.Mesh(this.pineGeo, this.pineMat);
    tree.scale.setScalar(13.5);
    tree.position.set(0.4, groundY - 0.5 + 13.5 * 0.497, -4.9);
    tree.frustumCulled = false;
    g.add(m, tree);
    g.position.x = x;
    this.scene.add(g);
    const shadow = this.B.disc.spawn({ x, y: roofTop + 0.05, z: (-1.5 + tipZ) / 2, keep: true, life: 1, size: 1, sx: 1.2, sy: (tipZ + 1.6) * 1.05, r: 0.20, g: 0.26, b: 0.40, a: 0.0, a1: 0.0 });
    const b = { group: g, x, tipZ, y0: roofTop + 0.30, y1: roofTop + 1.05, hit: false, shadow, passed: false, whoosh: false };
    this.list.push(b);
    return b;
  }
  update(dt, speed, P, out) {
    for (const b of this.list) {
      b.x -= speed * dt;
      b.group.position.x = b.x;
      if (b.shadow) {
        b.shadow.x = b.x;
        const onTrain = b.x < 60 && b.x > -60;
        b.shadow.a = b.shadow.a1 = onTrain ? 0.42 : 0;
      }
      // collision with the spirit
      if (!b.hit && (P.state === 'play') && P.inv <= 0) {
        const dx = Math.abs(P.x - b.x);
        if (dx < 0.66 && P.z < b.tipZ + 0.22 && P.y < b.y1 && P.y + PH.HEIGHT > b.y0) {
          b.hit = true; out.push({ type: 'hit', bough: b });
        }
      }
      if (!b.whoosh && Math.abs(P.x - b.x) < 3.5) { b.whoosh = true; out.push({ type: 'whoosh', bough: b }); }
      if (b.x < -80) b.dead = true;
    }
    for (const b of this.list) if (b.dead) { this.scene.remove(b.group); if (b.shadow) { b.shadow.keep = false; b.shadow.life = 0; } }
    this.list = this.list.filter((b) => !b.dead);
  }
}

// ------------------------------------------------------------------ wind gusts (high pass leg)
export class Wind {
  constructor() { this.state = 'calm'; this.t = 0; this.next = 4; this.v = 0; this.level = 0; }
  reset() { this.state = 'calm'; this.t = 0; this.next = 4; this.v = 0; this.level = 0; }
  update(dt, enabled, out) {
    this.t += dt;
    if (this.state === 'calm') {
      this.level = Math.max(0, this.level - dt * 0.8);
      if (enabled) { this.next -= dt; if (this.next <= 0) { this.state = 'warn'; this.t = 0; out.push('warn'); } }
    } else if (this.state === 'warn') {
      this.level = Math.min(0.45, this.level + dt * 0.5);
      if (this.t > 1.1) { this.state = 'blow'; this.t = 0; out.push('blow'); }
    } else if (this.state === 'blow') {
      this.level = Math.min(1, this.level + dt * 2.5);
      if (this.t > 2.4) { this.state = 'calm'; this.t = 0; this.next = 5.5 + Math.random() * 3.5; }
    }
    this.v = this.state === 'blow' ? -3.3 * this.level : -0.6 * this.level;
  }
}

export { N_WAGONS };
