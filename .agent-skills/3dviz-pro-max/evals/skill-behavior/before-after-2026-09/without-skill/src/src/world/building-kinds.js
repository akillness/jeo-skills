// The seven building archetypes of Emberhollow. Each returns a Group whose
// origin sits on the ground, with userData.height for camera framing.

import * as THREE from 'three';
import { paperMaterial, glowMaterial, PALETTE } from './noise-and-palette.js';
import { part, box, cyl, gableRoof, window_, lantern, beams } from './building-kit.js';

/** Timber-framed cottage / hall. The workhorse silhouette of the village. */
export function cottage(o = {}) {
  const w = o.width ?? 5, d = o.depth ?? 4, storyH = o.storyH ?? 2.6;
  const stories = o.stories ?? 1;
  const h = storyH * stories;
  const g = new THREE.Group();
  const wallMat = paperMaterial(o.wall ?? PALETTE.paperWall);
  const timberMat = paperMaterial(PALETTE.timber);
  const roofMat = paperMaterial(o.roof ?? PALETTE.roofPlum, { roughness: 0.85 });

  g.add(box(w, h, d, wallMat, 0, h / 2, 0));
  // Upper story oversails, a fold that reads well from any angle.
  if (stories > 1) {
    g.add(box(w + 0.8, storyH * 0.9, d + 0.7, wallMat, 0, h - storyH * 0.45, 0));
    g.add(beams(w + 0.8, storyH * 0.9, d + 0.7, timberMat).translateY(h - storyH * 0.45));
  }
  g.add(beams(w, h, d, timberMat).translateY(h / 2));
  const roofW = (stories > 1 ? w + 1.4 : w + 1.0);
  g.add(gableRoof(d + 1.1, roofW, o.roofHeight ?? 2.4, roofMat, 0, h - (stories > 1 ? 0.1 : 0), 0)
    .rotateY(Math.PI / 2));
  g.add(box(0.7, 2.4, 0.7, paperMaterial(PALETTE.stone), w * 0.3, h + 1.2, -d * 0.25));

  g.add(box(1.0, 1.8, 0.16, paperMaterial(PALETTE.timberDark), 0, 0.9, d / 2 + 0.02));
  g.add(window_(0.9, 0.9, -w * 0.28, h - 1.1, d / 2 + 0.06));
  g.add(window_(0.9, 0.9, w * 0.28, h - 1.1, d / 2 + 0.06));
  g.add(window_(0.8, 0.8, w / 2 + 0.06, h * 0.55, 0, Math.PI / 2));

  const lamp = lantern(0.8);
  lamp.position.set(w / 2 - 0.4, h - 0.4, d / 2 + 0.5);
  g.add(lamp);
  g.userData.height = h + (o.roofHeight ?? 2.4);
  return g;
}

/** Toadstool dwelling: bulbous stem, speckled cap, round door. */
export function mushroomHouse(o = {}) {
  const r = o.radius ?? 2.4, h = o.height ?? 3.4;
  const g = new THREE.Group();
  const stemMat = paperMaterial(PALETTE.mushroomStem);
  const capMat = paperMaterial(o.cap ?? PALETTE.mushroomCap, { roughness: 0.8 });

  const stem = cyl(r * 0.86, r, h, 9, stemMat, 0, h / 2, 0);
  g.add(stem);
  const cap = part(new THREE.SphereGeometry(r * 1.7, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
    capMat, 0, h, 0);
  cap.scale.set(1, 0.62, 1);
  g.add(cap);
  const spotMat = paperMaterial(PALETTE.paperWall);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const rr = r * (0.75 + (i % 3) * 0.22);
    const spot = part(new THREE.SphereGeometry(0.34 + (i % 3) * 0.1, 6, 5), spotMat,
      Math.cos(a) * rr, h + Math.cos(rr / (r * 1.7)) * 0.75, Math.sin(a) * rr);
    spot.scale.y = 0.4;
    g.add(spot);
  }
  g.add(part(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 10),
    paperMaterial(PALETTE.timberDark), 0, 1.0, r * 0.92).rotateX(Math.PI / 2));
  g.add(window_(0.7, 0.7, -r * 0.7, h * 0.66, r * 0.62, -0.6));
  const lamp = lantern(0.7, PALETTE.jade);
  lamp.position.set(r * 0.5, h + 0.5, r * 0.9);
  g.add(lamp);
  g.userData.height = h + r * 1.1;
  return g;
}

/** Windmill with sails that actually turn (userData.tick). */
export function windmill(o = {}) {
  const h = o.height ?? 9;
  const g = new THREE.Group();
  g.add(cyl(1.5, 2.4, h, 8, paperMaterial(PALETTE.paperWarm), 0, h / 2, 0));
  for (let i = 0; i < 3; i++) {
    g.add(part(new THREE.TorusGeometry(1.55 + i * 0.28, 0.09, 5, 10),
      paperMaterial(PALETTE.timber), 0, h * (0.72 - i * 0.3), 0).rotateX(Math.PI / 2));
  }
  g.add(part(new THREE.ConeGeometry(2.6, 2.0, 8), paperMaterial(PALETTE.roofTeal), 0, h + 1.0, 0));
  g.add(window_(0.7, 0.9, 0, h * 0.55, 1.85));

  const hub = new THREE.Group();
  hub.position.set(0, h * 0.86, 2.1);
  const armMat = paperMaterial(PALETTE.timberDark);
  const sailMat = paperMaterial(PALETTE.cloth, { roughness: 0.95 });
  hub.add(part(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 8), armMat).rotateX(Math.PI / 2));
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / 4) * Math.PI * 2;
    arm.add(box(0.18, 6.4, 0.18, armMat, 0, 3.0, 0));
    const sail = box(1.5, 4.6, 0.1, sailMat, 0.85, 3.4, 0.16);
    sail.rotation.z = 0.12;
    arm.add(sail);
    hub.add(arm);
  }
  g.add(hub);
  g.userData.tick = (t) => { hub.rotation.z = t * 0.55; };
  g.userData.height = h + 2.4;
  return g;
}

/** Beacon tower: tapered stone shaft, timber gallery, pulsing signal fire. */
export function watchtower(o = {}) {
  const h = o.height ?? 13;
  const g = new THREE.Group();
  g.add(cyl(1.5, 2.6, h, 7, paperMaterial(PALETTE.stone), 0, h / 2, 0));
  g.add(part(new THREE.TorusGeometry(2.1, 0.22, 5, 12), paperMaterial(PALETTE.timber), 0, h * 0.74, 0)
    .rotateX(Math.PI / 2));
  g.add(cyl(2.3, 2.3, 0.5, 7, paperMaterial(PALETTE.timber), 0, h - 1.6, 0));
  g.add(cyl(1.55, 1.55, 1.9, 7, paperMaterial(PALETTE.paperWall), 0, h - 0.4, 0));
  g.add(part(new THREE.ConeGeometry(2.4, 2.4, 7), paperMaterial(PALETTE.roofIndigo), 0, h + 1.7, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(window_(0.6, 1.1, Math.cos(a) * 1.5, h - 0.5, Math.sin(a) * 1.5, -a + Math.PI / 2));
  }
  const beacon = part(new THREE.IcosahedronGeometry(0.85, 0), glowMaterial(PALETTE.emberDeep, 2.0), 0, h + 3.3, 0);
  beacon.castShadow = false;
  g.add(beacon);
  const light = new THREE.PointLight(PALETTE.emberDeep, 120, 60, 2);
  light.position.set(0, h + 3.3, 0);
  g.add(light);
  g.userData.tick = (t) => {
    const p = 0.8 + 0.2 * Math.sin(t * 2.2);
    beacon.scale.setScalar(p);
    beacon.rotation.y = t * 0.6;
    light.intensity = 100 + Math.sin(t * 2.2) * 40;
  };
  g.userData.height = h + 4;
  return g;
}
