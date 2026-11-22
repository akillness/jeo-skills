// Reusable papercraft parts. Every building in the hollow is folded from these.

import * as THREE from 'three';
import { paperMaterial, glowMaterial, PALETTE } from './noise-and-palette.js';

/** Mesh helper that also registers casting/receiving shadows. */
export function part(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w, h, d, mat, x, y, z) {
  return part(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}

export function cyl(rTop, rBot, h, seg, mat, x, y, z) {
  return part(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y, z);
}

/** Gable roof: ridge runs along X, base sits at y = 0, apex at y = height. */
export function gableRoofGeometry(length, width, height) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 3);
  geo.rotateZ(Math.PI / 2);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.5, 0);
  geo.scale(length, height / 1.5, width / 1.7320508);
  return geo;
}

export function gableRoof(length, width, height, mat, x, y, z) {
  return part(gableRoofGeometry(length, width, height), mat, x, y, z);
}

/** Warm window: a slightly proud glowing pane on one face of a wall. */
export function window_(w, h, x, y, z, rotY = 0) {
  const mesh = part(new THREE.BoxGeometry(w, h, 0.12), glowMaterial(PALETTE.ember, 1.15), x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = false;
  return mesh;
}

/** Hanging paper lantern — the signature motif of the village. */
export function lantern(scale = 1, color = PALETTE.ember) {
  const g = new THREE.Group();
  const shade = part(new THREE.SphereGeometry(0.5 * scale, 8, 6), glowMaterial(color, 1.35));
  shade.scale.set(1, 1.25, 1);
  shade.castShadow = false;
  const cap = part(new THREE.ConeGeometry(0.34 * scale, 0.22 * scale, 6),
    paperMaterial(PALETTE.timberDark), 0, 0.62 * scale, 0);
  const cord = part(new THREE.CylinderGeometry(0.02, 0.02, 0.8 * scale, 4),
    paperMaterial(PALETTE.timberDark), 0, 1.05 * scale, 0);
  g.add(shade, cap, cord);
  g.userData.glow = shade;
  return g;
}

/** Timber A-frame bracing that reads clearly even in silhouette. */
export function beams(width, height, depth, mat) {
  const g = new THREE.Group();
  const t = 0.16;
  g.add(box(width + 0.06, t, t, mat, 0, height / 2 - t / 2, depth / 2));
  g.add(box(width + 0.06, t, t, mat, 0, -height / 2 + t / 2, depth / 2));
  const diag = box(t, Math.hypot(width, height) * 0.92, t, mat, 0, 0, depth / 2);
  diag.rotation.z = Math.atan2(height, width);
  g.add(diag);
  return g;
}

/** Low-poly tree with a stacked, faceted canopy. */
export function tree(rng, tall = false) {
  const g = new THREE.Group();
  const h = (tall ? 6 : 3.4) + rng() * 2.2;
  const trunkMat = paperMaterial(PALETTE.timber);
  g.add(cyl(0.16, 0.32, h, 5, trunkMat, 0, h / 2, 0));
  const leafColor = rng() > 0.78 ? PALETTE.leafPink : (rng() > 0.5 ? PALETTE.leafDeep : PALETTE.leafLight);
  const leafMat = paperMaterial(leafColor, { roughness: 0.98 });
  const tiers = tall ? 3 : 2;
  for (let i = 0; i < tiers; i++) {
    const r = (tall ? 2.4 : 2.0) * (1 - i * 0.26) + rng() * 0.3;
    const cone = part(new THREE.ConeGeometry(r, r * 1.5, 6), leafMat, 0, h * 0.72 + i * r * 0.82, 0);
    cone.rotation.y = rng() * Math.PI;
    g.add(cone);
  }
  return g;
}

/** Cluster of glowing toadstools used as ground detail near paths. */
export function toadstools(rng) {
  const g = new THREE.Group();
  const capMat = paperMaterial(PALETTE.mushroomCap);
  const stemMat = glowMaterial(PALETTE.mushroomStem, 0.5);
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.28 + rng() * 0.4;
    const x = (rng() - 0.5) * 1.6, z = (rng() - 0.5) * 1.6;
    g.add(cyl(0.09 * s * 3, 0.11 * s * 3, s * 1.6, 5, stemMat, x, s * 0.8, z));
    g.add(part(new THREE.SphereGeometry(s, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      capMat, x, s * 1.6, z));
  }
  return g;
}

/** Fence run of leaning paper pickets between two points. */
export function fence(from, to, groundY, rng) {
  const g = new THREE.Group();
  const mat = paperMaterial(PALETTE.timber);
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.round(len / 1.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t, z = from.z + dz * t;
    const y = groundY(x, z);
    const post = box(0.16, 1.3 + rng() * 0.3, 0.16, mat, x, y + 0.6, z);
    post.rotation.z = (rng() - 0.5) * 0.16;
    g.add(post);
  }
  return g;
}
