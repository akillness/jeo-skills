// Waterside and civic structures: stilt house, market stall, moonwell, bridge.

import * as THREE from 'three';
import { paperMaterial, glowMaterial, PALETTE } from './noise-and-palette.js';
import { part, box, cyl, gableRoof, window_, lantern } from './building-kit.js';

/** River dwelling raised on crooked legs, with a jetty and a ladder. */
export function stiltHouse(o = {}) {
  const legH = o.legHeight ?? 4.2, w = 4.4, d = 3.6;
  const g = new THREE.Group();
  const timber = paperMaterial(PALETTE.timber);
  const wall = paperMaterial(o.wall ?? PALETTE.paperWarm);

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = cyl(0.2, 0.28, legH, 5, timber, sx * (w / 2 - 0.4), legH / 2, sz * (d / 2 - 0.4));
    leg.rotation.x = sz * 0.05; leg.rotation.z = -sx * 0.05;
    g.add(leg);
  }
  g.add(box(w + 0.9, 0.28, d + 0.9, timber, 0, legH, 0));
  g.add(box(w, 2.5, d, wall, 0, legH + 1.25, 0));
  g.add(gableRoof(d + 1.2, w + 1.2, 2.0, paperMaterial(o.roof ?? PALETTE.roofTeal), 0, legH + 2.5, 0)
    .rotateY(Math.PI / 2));
  g.add(window_(1.0, 0.9, 0, legH + 1.5, d / 2 + 0.06));

  // Jetty reaching out over the water.
  g.add(box(1.6, 0.16, 4.2, timber, 0, legH * 0.35, d / 2 + 2.4));
  g.add(cyl(0.16, 0.16, legH * 0.7, 5, timber, 0.6, legH * 0.18, d / 2 + 4.2));
  const ladder = new THREE.Group();
  for (let i = 0; i < 6; i++) ladder.add(box(1.1, 0.1, 0.1, timber, 0, i * 0.62, 0));
  ladder.position.set(0, 0.4, d / 2 + 0.6);
  ladder.rotation.x = -0.16;
  g.add(ladder);

  const lamp = lantern(0.9, PALETTE.ember);
  lamp.position.set(-w / 2 + 0.3, legH + 3.2, d / 2 + 0.8);
  g.add(lamp);
  g.userData.height = legH + 4.5;
  return g;
}

/** Market stall with a striped awning and crates of goods. */
export function marketStall(o = {}) {
  const g = new THREE.Group();
  const timber = paperMaterial(PALETTE.timberDark);
  const stripeA = paperMaterial(o.cloth ?? PALETTE.cloth, { roughness: 0.95 });
  const stripeB = paperMaterial(PALETTE.paperWall, { roughness: 0.95 });
  const w = 4.2, d = 2.6, h = 2.6;

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(cyl(0.11, 0.13, h, 5, timber, sx * w / 2, h / 2, sz * d / 2));
  }
  for (let i = 0; i < 6; i++) {
    const seg = box(w / 6 + 0.02, 0.1, d + 1.5, i % 2 ? stripeA : stripeB,
      -w / 2 + (i + 0.5) * (w / 6), h + 0.5, 0);
    seg.rotation.x = 0;
    g.add(seg);
  }
  g.add(gableRoof(d + 1.5, w + 0.4, 0.9, stripeA, 0, h + 0.5, 0).rotateY(Math.PI / 2));
  g.add(box(w, 0.16, d * 0.8, paperMaterial(PALETTE.timber), 0, h * 0.55, 0));
  const crateMat = paperMaterial(PALETTE.paperWarm);
  const fruitMat = glowMaterial(PALETTE.jade, 0.35);
  for (let i = 0; i < 4; i++) {
    g.add(box(0.7, 0.6, 0.7, crateMat, -w / 2 + 0.7 + i * 0.95, h * 0.55 + 0.38, -0.3));
    g.add(part(new THREE.IcosahedronGeometry(0.22, 0), fruitMat,
      -w / 2 + 0.7 + i * 0.95, h * 0.55 + 0.82, -0.3));
  }
  const lamp = lantern(0.7, PALETTE.emberDeep);
  lamp.position.set(w / 2, h - 0.3, d / 2);
  g.add(lamp);
  g.userData.height = h + 1.6;
  return g;
}

/** The Moonwell: stone ring, timber yoke, a bucket and a pool of jade light. */
export function moonwell() {
  const g = new THREE.Group();
  const stone = paperMaterial(PALETTE.stone);
  g.add(cyl(1.5, 1.7, 1.2, 10, stone, 0, 0.6, 0));
  const waterDisc = part(new THREE.CircleGeometry(1.28, 12), glowMaterial(PALETTE.jade, 1.6), 0, 1.16, 0);
  waterDisc.rotation.x = -Math.PI / 2;
  waterDisc.castShadow = false;
  g.add(waterDisc);
  const timber = paperMaterial(PALETTE.timber);
  g.add(box(0.22, 3.0, 0.22, timber, -1.3, 1.5, 0));
  g.add(box(0.22, 3.0, 0.22, timber, 1.3, 1.5, 0));
  g.add(cyl(0.16, 0.16, 2.9, 6, timber, 0, 3.0, 0).rotateZ(Math.PI / 2));
  g.add(gableRoof(2.4, 3.4, 1.1, paperMaterial(PALETTE.roofOchre), 0, 3.1, 0));
  const bucket = cyl(0.36, 0.3, 0.5, 7, paperMaterial(PALETTE.timberDark), 0.2, 2.1, 0);
  g.add(cyl(0.03, 0.03, 1.0, 4, timber, 0.2, 2.6, 0));
  g.add(bucket);
  g.userData.tick = (t) => {
    bucket.position.y = 2.1 + Math.sin(t * 0.9) * 0.18;
    waterDisc.material.emissiveIntensity = 1.3 + Math.sin(t * 1.6) * 0.35;
  };
  g.userData.height = 4.4;
  return g;
}

/** Arched footbridge, built as a chain of planks following a parabola. */
export function bridge(o = {}) {
  const span = o.span ?? 26, rise = o.rise ?? 4.2;
  const g = new THREE.Group();
  const deck = paperMaterial(PALETTE.timber);
  const rail = paperMaterial(PALETTE.timberDark);
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const arc = (t) => rise * (1 - Math.pow(2 * t - 1, 2));
    const z0 = (t0 - 0.5) * span, z1 = (t1 - 0.5) * span;
    const y0 = arc(t0), y1 = arc(t1);
    const seg = box(3.2, 0.26, Math.hypot(z1 - z0, y1 - y0) + 0.08, deck,
      0, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
    g.add(seg);
    if (i % 3 === 0) {
      for (const sx of [-1, 1]) {
        g.add(box(0.14, 1.1, 0.14, rail, sx * 1.5, y0 + 0.6, z0));
        g.add(box(0.1, 0.1, span / steps * 3.2, rail, sx * 1.5, y0 + 1.1, z0 + span / steps * 1.5));
      }
    }
  }
  for (const sz of [-1, 1]) {
    const lamp = lantern(0.85, PALETTE.ember);
    lamp.position.set(1.5, 1.9, sz * span * 0.46);
    g.add(lamp);
  }
  g.userData.height = rise + 3;
  return g;
}
