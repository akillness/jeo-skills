// The living things: hoglets that trot the lanes, lantern wisps that drift
// over the square, and a paper serpent riding the aurora.

import * as THREE from 'three';
import { makeRng, paperMaterial, glowMaterial, PALETTE } from '../world/noise-and-palette.js';
import { groundY, WATER_LEVEL } from '../world/terrain.js';
import { part, cyl } from '../world/building-kit.js';

/** Small tusked forager. Legs swing, ears wobble, body hops on the beat. */
function makeHoglet(tint) {
  const g = new THREE.Group();
  const bodyMat = paperMaterial(tint);
  const darkMat = paperMaterial(PALETTE.timberDark);
  const body = part(new THREE.IcosahedronGeometry(0.9, 0), bodyMat, 0, 1.0, 0);
  body.scale.set(1.25, 0.85, 0.9);
  g.add(body);
  const head = part(new THREE.IcosahedronGeometry(0.55, 0), bodyMat, 0, 1.05, 0.95);
  g.add(head);
  g.add(part(new THREE.ConeGeometry(0.26, 0.7, 5), darkMat, 0, 0.95, 1.45).rotateX(Math.PI / 2));
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = part(new THREE.SphereGeometry(0.11, 6, 5), glowMaterial(PALETTE.jade, 1.6), sx * 0.26, 1.2, 1.28);
    e.castShadow = false; eyes.push(e); g.add(e);
  }
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = part(new THREE.ConeGeometry(0.2, 0.5, 4), bodyMat, sx * 0.34, 1.5, 0.85);
    ear.rotation.z = sx * 0.4; ears.push(ear); g.add(ear);
  }
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = cyl(0.13, 0.16, 0.75, 5, darkMat, sx * 0.45, 0.38, sz * 0.5);
    legs.push(leg); g.add(leg);
  }
  const tail = part(new THREE.ConeGeometry(0.13, 0.5, 4), bodyMat, 0, 1.15, -1.05);
  tail.rotation.x = -0.9;
  g.add(tail);
  g.userData = { body, legs, ears, tail, eyes };
  return g;
}

/** Closed loop through the meadows; y is sampled from the terrain each frame. */
function makeRoute(points) {
  return new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])), true, 'catmullrom', 0.5);
}

const ROUTES = [
  makeRoute([[-24, -20], [-6, -26], [16, -20], [26, 2], [12, 20], [-10, 22], [-26, 6]]),
  makeRoute([[-12, 6], [4, 12], [14, 2], [6, -8], [-8, -6]]),
  makeRoute([[18, 26], [34, 18], [40, -6], [26, -18], [16, -2]])
];

export function createCreatures() {
  const group = new THREE.Group();
  const rng = makeRng(9001);
  const tints = [0x8f6b9e, 0xc98a6b, 0x6b8fa8];
  const hoglets = [];

  for (let i = 0; i < 3; i++) {
    const h = makeHoglet(tints[i]);
    h.scale.setScalar(0.85 + i * 0.16);
    group.add(h);
    hoglets.push({ obj: h, route: ROUTES[i], t: rng(), speed: 0.017 + rng() * 0.012 });
  }

  // Lantern wisps: a glowing core with a short comet tail of shrinking beads.
  const wisps = [];
  for (let i = 0; i < 5; i++) {
    const wisp = new THREE.Group();
    const color = i % 2 ? PALETTE.jade : PALETTE.ember;
    const core = part(new THREE.IcosahedronGeometry(0.34, 0), glowMaterial(color, 2.1));
    core.castShadow = false;
    wisp.add(core);
    const tail = [];
    for (let k = 1; k <= 5; k++) {
      const bead = part(new THREE.SphereGeometry(0.3 - k * 0.045, 6, 5), glowMaterial(color, 1.4 - k * 0.2));
      bead.castShadow = false;
      bead.material.transparent = true;
      bead.material.opacity = 1 - k * 0.16;
      wisp.add(bead); tail.push(bead);
    }
    group.add(wisp);
    wisps.push({ obj: wisp, core, tail, trail: [],
      r: 15 + i * 5, h: 4 + rng() * 5, speed: 0.28 + rng() * 0.3, phase: rng() * 6.28 });
  }

  // Paper serpent: 14 segments that lag behind a slow lissajous head.
  const serpent = new THREE.Group();
  const segs = [];
  for (let i = 0; i < 14; i++) {
    const s = 1.5 * (1 - i / 20);
    const seg = part(new THREE.OctahedronGeometry(s, 0),
      paperMaterial(i % 2 ? PALETTE.roofPlum : PALETTE.cloth));
    seg.castShadow = false;
    if (i === 0) {
      seg.add(part(new THREE.ConeGeometry(0.5, 1.4, 5), paperMaterial(PALETTE.ember), 0, 0, 1.2)
        .rotateX(Math.PI / 2));
      for (const sx of [-1, 1]) {
        const fin = part(new THREE.ConeGeometry(0.5, 1.8, 4), paperMaterial(PALETTE.jade), sx * 1.1, 0.4, 0);
        fin.rotation.z = sx * 1.2; seg.add(fin);
      }
    }
    serpent.add(seg); segs.push(seg);
  }
  group.add(serpent);

  const tmp = new THREE.Vector3();
  const head = new THREE.Vector3();
  const history = [];

  group.userData.tick = (t, dt) => {
    for (const h of hoglets) {
      h.t = (h.t + dt * h.speed) % 1;
      h.route.getPointAt(h.t, tmp);
      const y = Math.max(groundY(tmp.x, tmp.z), WATER_LEVEL);
      const hop = Math.abs(Math.sin(t * 7 * h.speed * 45)) * 0.22;
      h.obj.position.set(tmp.x, y + hop, tmp.z);
      const ahead = h.route.getPointAt((h.t + 0.01) % 1);
      h.obj.rotation.y = Math.atan2(ahead.x - tmp.x, ahead.z - tmp.z);
      const swing = t * 9;
      h.obj.userData.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(swing + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * 0.5;
      });
      h.obj.userData.ears.forEach((ear, i) => { ear.rotation.x = Math.sin(t * 4 + i) * 0.28; });
      h.obj.userData.tail.rotation.z = Math.sin(t * 6) * 0.4;
      h.obj.userData.body.position.y = 1.0 + Math.sin(swing * 2) * 0.05;
    }

    for (const w of wisps) {
      const a = t * w.speed + w.phase;
      const x = Math.cos(a) * w.r + Math.sin(a * 2.3) * 4;
      const z = Math.sin(a * 0.9) * w.r + 2 + Math.cos(a * 1.7) * 4;
      const y = Math.max(groundY(x, z), WATER_LEVEL) + w.h + Math.sin(a * 3) * 1.1;
      w.obj.position.set(0, 0, 0);
      w.core.position.set(x, y, z);
      w.trail.unshift(new THREE.Vector3(x, y, z));
      if (w.trail.length > 40) w.trail.pop();
      w.tail.forEach((bead, k) => {
        const p = w.trail[Math.min(w.trail.length - 1, (k + 1) * 5)];
        if (p) bead.position.copy(p);
      });
      w.core.rotation.set(t * 1.5, t * 2.1, 0);
    }

    head.set(
      Math.sin(t * 0.14) * 62,
      42 + Math.sin(t * 0.31) * 9,
      Math.cos(t * 0.11) * 62 - 10
    );
    history.unshift(head.clone());
    if (history.length > 200) history.pop();
    segs.forEach((seg, i) => {
      const p = history[Math.min(history.length - 1, i * 7)];
      if (!p) return;
      seg.position.copy(p);
      const nxt = history[Math.min(history.length - 1, i * 7 + 7)];
      if (nxt) seg.lookAt(nxt);
      seg.rotateZ(t * 0.6 + i * 0.4);
    });
  };
  return group;
}
