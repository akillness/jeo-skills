// Everything that dresses the hollow: woods, the plaza and its bonfire,
// lantern posts, boulders, fences and a drift of fireflies.

import * as THREE from 'three';
import { makeRng, paperMaterial, glowMaterial, PALETTE } from './noise-and-palette.js';
import { groundY, WATER_LEVEL } from './terrain.js';
import { part, box, cyl, tree, toadstools, fence, lantern } from './building-kit.js';
import { VILLAGE } from './village-layout.js';

const riverCenter = (x) => 34 + Math.sin(x * 0.045) * 11 + Math.sin(x * 0.017 + 1.7) * 6;

function blocked(x, z) {
  if (Math.hypot(x * 0.85, (z + 4) * 1.05) < 21) return true;      // village square
  if (Math.abs(z - riverCenter(x)) < 15) return true;              // river corridor
  for (const b of VILLAGE) if (Math.hypot(x - b.x, z - b.z) < b.r + 6) return true;
  return false;
}

export function createWoods() {
  const g = new THREE.Group();
  const rng = makeRng(4242);
  let placed = 0, tries = 0;
  while (placed < 190 && tries < 4000) {
    tries++;
    const x = (rng() - 0.5) * 230, z = (rng() - 0.5) * 230;
    if (blocked(x, z)) continue;
    const y = groundY(x, z);
    if (y < WATER_LEVEL + 0.8 || y > 34) continue;
    const t = tree(rng, y > 9 || rng() > 0.72);
    t.position.set(x, y - 0.2, z);
    t.rotation.y = rng() * Math.PI * 2;
    const s = 0.75 + rng() * 0.6;
    t.scale.setScalar(s);
    g.add(t);
    placed++;
  }
  // Toadstool clusters and boulders scattered nearer the paths.
  const rockMat = paperMaterial(PALETTE.rock);
  for (let i = 0; i < 70; i++) {
    const x = (rng() - 0.5) * 190, z = (rng() - 0.5) * 190;
    const y = groundY(x, z);
    if (y < WATER_LEVEL) continue;
    if (rng() > 0.45) {
      const rock = part(new THREE.IcosahedronGeometry(0.8 + rng() * 1.9, 0), rockMat, x, y - 0.3, z);
      rock.rotation.set(rng(), rng(), rng());
      rock.scale.set(1, 0.6 + rng() * 0.5, 1);
      g.add(rock);
    } else {
      const cluster = toadstools(rng);
      cluster.position.set(x, y, z);
      g.add(cluster);
    }
  }
  return g;
}

/** Village square: a paved disc, a bonfire, lantern posts and low fences. */
export function createSquare() {
  const g = new THREE.Group();
  const rng = makeRng(777);
  const cx = 0, cz = 2;
  const y = groundY(cx, cz);

  const plaza = part(new THREE.CylinderGeometry(10, 10.6, 0.5, 14), paperMaterial(PALETTE.stone), cx, y - 0.1, cz);
  plaza.receiveShadow = true;
  g.add(plaza);
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, r = 2.5 + rng() * 7;
    const slab = part(new THREE.CylinderGeometry(1.1 + rng(), 1.2 + rng(), 0.16, 6),
      paperMaterial(PALETTE.rockHigh), cx + Math.cos(a) * r, y + 0.2, cz + Math.sin(a) * r);
    slab.rotation.y = rng() * Math.PI;
    g.add(slab);
  }

  // Bonfire: stacked logs and a flickering ember core.
  const logMat = paperMaterial(PALETTE.timberDark);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const log = cyl(0.16, 0.22, 3.0, 5, logMat, cx + Math.cos(a) * 0.75, y + 1.2, cz + Math.sin(a) * 0.75);
    log.rotation.set(Math.cos(a) * 0.34, 0, -Math.sin(a) * 0.34);
    g.add(log);
  }
  const flame = part(new THREE.ConeGeometry(1.0, 3.0, 6), glowMaterial(PALETTE.emberDeep, 1.7), cx, y + 2.4, cz);
  flame.castShadow = false;
  const flameInner = part(new THREE.ConeGeometry(0.5, 2.0, 5), glowMaterial(PALETTE.ember, 2.3), cx, y + 2.1, cz);
  flameInner.castShadow = false;
  g.add(flame, flameInner);

  // Lantern posts ringing the square.
  const posts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const px = cx + Math.cos(a) * 13.5, pz = cz + Math.sin(a) * 13.5;
    const py = groundY(px, pz);
    const post = cyl(0.13, 0.18, 3.6, 5, paperMaterial(PALETTE.timber), px, py + 1.8, pz);
    g.add(post);
    const arm = box(0.9, 0.12, 0.12, paperMaterial(PALETTE.timber), px + 0.4, py + 3.5, pz);
    g.add(arm);
    const lamp = lantern(0.85, i % 3 === 0 ? PALETTE.jade : PALETTE.ember);
    lamp.position.set(px + 0.8, py + 2.9, pz);
    g.add(lamp);
    posts.push(lamp);
  }

  g.add(fence({ x: -22, z: 16 }, { x: -9, z: 19 }, groundY, rng));
  g.add(fence({ x: 10, z: 17 }, { x: 24, z: 10 }, groundY, rng));
  g.add(fence({ x: 22, z: -14 }, { x: 30, z: -20 }, groundY, rng));

  g.userData.tick = (t) => {
    const f = 1 + Math.sin(t * 6.1) * 0.08 + Math.sin(t * 11.3) * 0.05;
    flame.scale.set(f, 1 + Math.sin(t * 4.4) * 0.12, f);
    flameInner.scale.set(1 / f, 1 + Math.cos(t * 5.2) * 0.16, 1 / f);
    flame.rotation.y = t * 0.7;
    posts.forEach((p, i) => {
      p.userData.glow.material.emissiveIntensity = 1.25 + Math.sin(t * 2.3 + i) * 0.3;
    });
  };
  return g;
}

/** Fireflies drifting over the meadows and the river. */
export function createFireflies(count = 220) {
  const rng = makeRng(31337);
  const pos = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * 150, z = (rng() - 0.5) * 150;
    const y = Math.max(groundY(x, z), WATER_LEVEL) + 1.2 + rng() * 5;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    seeds.push({ x, y, z, p: rng() * Math.PI * 2, s: 0.4 + rng() * 0.9 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: PALETTE.ember, size: 0.42, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geo, mat);
  points.userData.tick = (t) => {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      arr[i * 3] = s.x + Math.sin(t * s.s + s.p) * 2.4;
      arr[i * 3 + 1] = s.y + Math.sin(t * s.s * 1.7 + s.p) * 0.9;
      arr[i * 3 + 2] = s.z + Math.cos(t * s.s * 0.8 + s.p) * 2.4;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return points;
}
