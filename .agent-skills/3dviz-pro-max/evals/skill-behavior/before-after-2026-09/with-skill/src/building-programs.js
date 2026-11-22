// building-programs.js - one builder per program. Each adds exactly the feature its work demands:
// the mill a wheel that reaches water, the smithy a flue and a yard, the store a lifted floor and a
// hoist. Silhouettes differ because the work differs (knowledge.reasoning-settlement-function-variation).
// Every builder draws from building-kit.js so the joinery stays one culture.
import * as THREE from 'three';
import { add, curlRoof, door, gable, lantern, walls, window_ } from './building-kit.js';

/** The landmark: a hollow petrified stump with a burning crown and a stair climbing it. */
function beacon(group, m) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    add(group, new THREE.ConeGeometry(0.62, 3.1, 6), m.bark,
      [Math.cos(a) * 3.2, 0.5, Math.sin(a) * 3.2], [Math.cos(a) * 0.62, -a, -Math.sin(a) * 0.62]);
  }
  add(group, new THREE.CylinderGeometry(2.95, 3.9, 5.4, 20, 1), m.stump, [0, 2.7, 0]);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    add(group, new THREE.BoxGeometry(0.58, 5.2, 0.62), m.darkTimber,
      [Math.cos(a) * 3.32, 2.5, Math.sin(a) * 3.32], [0, -a, 0]);
  }
  add(group, new THREE.CylinderGeometry(3.05, 2.8, 1.15, 20, 1, true), m.stone, [0, 5.9, 0]);
  add(group, new THREE.IcosahedronGeometry(0.95, 1), m.flame, [0, 6.05, 0]);
  for (let i = 0; i < 8; i++) { // ember stones banked around the fire, and moss on the old wood
    const a = i * 0.79;
    add(group, new THREE.DodecahedronGeometry(0.34, 0), m.coal, [Math.cos(a) * 2.1, 5.75, Math.sin(a) * 2.1], [a, a, 0]);
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.4;
    add(group, new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.28, 1), m.shrub,
      [Math.cos(a) * 3.3, 0.5 + (i % 3) * 1.4, Math.sin(a) * 3.3], [0, -a, 0.2]);
  }
  add(group, new THREE.TorusGeometry(2.6, 0.09, 6, 20), m.iron, [0, 6.4, 0], [Math.PI / 2, 0, 0]);
  // Keeper's stair: one straight flight from the lane to the crown, 14 treads over a 5.6 m rise.
  const RISE = 5.6, RUN = 5.2, FOOT = 8.0, pitch = Math.atan2(RISE, RUN);
  for (let i = 0; i < 14; i++) {
    const t = (i + 0.5) / 14;
    add(group, new THREE.BoxGeometry(1.25, 0.14, 0.44), m.timber, [0, t * RISE, FOOT - t * RUN]);
  }
  for (const sx of [-0.66, 0.66]) {
    add(group, new THREE.BoxGeometry(0.16, 0.16, Math.hypot(RISE, RUN)), m.darkTimber,
      [sx, RISE / 2, FOOT - RUN / 2], [-pitch, 0, 0]);
    add(group, new THREE.BoxGeometry(0.09, 0.09, Math.hypot(RISE, RUN)), m.timber,
      [sx, RISE / 2 + 0.95, FOOT - RUN / 2], [-pitch, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      add(group, new THREE.CylinderGeometry(0.055, 0.055, 1.0, 5), m.timber, [sx, t * RISE + 0.5, FOOT - t * RUN]);
    }
  }
  add(group, new THREE.BoxGeometry(1.8, 0.18, 1.3), m.timber, [0, RISE, 2.55]);
  add(group, new THREE.BoxGeometry(1.3, 2.0, 0.5), m.darkTimber, [0, 1.0, 3.5]);
  lantern(group, { position: [1.7, 4.2, 3.0], iron: m.iron, flame: m.flame, size: 0.14 });
  const glow = new THREE.PointLight(0xffb46b, 26, 22, 2);
  glow.position.set(0, 6.0, 0);
  group.add(glow);
}

/** The gathering space: one long ridge, a porch of lanterns, the widest doorway in the village. */
function hall(group, m) {
  walls(group, { width: 9, depth: 5.4, height: 3.0, wall: m.plaster, timber: m.timber });
  curlRoof(group, m.thatch, { width: 9.2, depth: 5.4, height: 3.0, overhang: 0.9, y: 3.0 });
  for (const sz of [-1, 1]) gable(group, m.plasterAlt, { width: 9.2, height: 3.0, y: 3.0, z: sz * 2.72 });
  door(group, { z: 2.72, timber: m.darkTimber, glow: m.glow, width: 1.6 });
  for (const shift of [-3.2, -1.9, 1.9, 3.2]) {
    window_(group, { axis: 'z', sign: 1, offset: 2.7, y: 1.85, shift, timber: m.timber, glow: m.glow });
  }
  window_(group, { axis: 'x', sign: -1, offset: 4.5, y: 1.85, timber: m.timber, glow: m.glow });
  for (const sx of [-2.3, 2.3]) {
    add(group, new THREE.CylinderGeometry(0.14, 0.17, 2.7, 7), m.timber, [sx, 1.35, 4.0]);
  }
  add(group, new THREE.BoxGeometry(5.4, 0.22, 0.28), m.timber, [0, 2.75, 4.0]);
  for (const sx of [-2.0, 0, 2.0]) lantern(group, { position: [sx, 2.2, 4.0], iron: m.iron, flame: m.flame });
  add(group, new THREE.BoxGeometry(1.0, 4.6, 1.0), m.stone, [-4.0, 2.3, -1.4]);
}

/** Water-driven: the wheel is the reason this building stands on the lowest terrace. */
function mill(group, m) {
  walls(group, { width: 5.2, depth: 4.6, height: 3.7, wall: m.plaster, timber: m.timber });
  curlRoof(group, m.thatch, { width: 5.4, depth: 4.6, height: 2.6, overhang: 0.7, y: 3.7 });
  for (const sz of [-1, 1]) gable(group, m.plasterAlt, { width: 5.4, height: 2.6, y: 3.7, z: sz * 2.32 });
  door(group, { z: 2.35, timber: m.darkTimber, glow: m.glow });
  window_(group, { axis: 'z', sign: 1, offset: 2.3, y: 2.7, shift: -1.5, timber: m.timber, glow: m.glow });
  window_(group, { axis: 'x', sign: -1, offset: 2.6, y: 1.7, timber: m.timber, glow: m.glow });
  // The wheel: rims in the local XY plane, axle along z, hung off the bank so it reaches the pond.
  const wheel = new THREE.Group();
  wheel.position.set(4.2, -0.4, 0.6);
  wheel.rotation.y = Math.PI / 2; // axle runs into the mill wall, wheel face out over the water
  add(wheel, new THREE.CylinderGeometry(0.15, 0.15, 3.2, 8), m.iron, [0, 0, 0], [Math.PI / 2, 0, 0]);
  for (const sz of [-0.6, 0.6]) add(wheel, new THREE.TorusGeometry(2.2, 0.11, 6, 26), m.darkTimber, [0, 0, sz]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(wheel, new THREE.BoxGeometry(0.85, 0.12, 1.4), m.darkTimber,
      [Math.cos(a) * 2.0, Math.sin(a) * 2.0, 0], [0, 0, a + Math.PI / 2]);
    add(wheel, new THREE.BoxGeometry(2.1, 0.1, 0.16), m.timber,
      [Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0], [0, 0, a]);
  }
  group.add(wheel);
  add(group, new THREE.BoxGeometry(2.8, 0.26, 0.95), m.timber, [2.4, 2.6, 0.6], [0, 0, -0.3]); // sluice to the wheel
  for (const sx of [-1.9, -1.2]) add(group, new THREE.CylinderGeometry(0.75, 0.75, 0.2, 16), m.stone, [sx, 0.5, 2.9], [0.35, 0, 0.2]);
  return { wheel };
}

/** Fuel burns here, so the flue is twice the roof height and the yard is open to the lane. */
function smithy(group, m) {
  walls(group, { width: 5.6, depth: 4.8, height: 2.5, wall: m.stone, timber: m.darkTimber });
  curlRoof(group, m.thatch, { width: 5.8, depth: 4.8, height: 1.8, overhang: 0.75, y: 2.5 });
  for (const sz of [-1, 1]) gable(group, m.stone, { width: 5.8, height: 1.8, y: 2.5, z: sz * 2.42 });
  add(group, new THREE.CylinderGeometry(0.52, 0.92, 4.9, 8), m.stone, [-1.9, 3.9, -1.4]);
  add(group, new THREE.CylinderGeometry(0.66, 0.52, 0.4, 8), m.iron, [-1.9, 6.4, -1.4]);
  add(group, new THREE.BoxGeometry(2.6, 1.9, 0.3), m.darkTimber, [0.9, 1.15, 2.42]); // open forge front
  add(group, new THREE.PlaneGeometry(2.2, 1.4), m.forge, [0.9, 1.15, 2.6]);
  add(group, new THREE.BoxGeometry(5.6, 0.14, 4.2), m.paving, [0.4, 0.07, 5.2]);
  add(group, new THREE.CylinderGeometry(0.42, 0.46, 0.55, 10), m.darkTimber, [-0.9, 0.4, 4.6]);
  add(group, new THREE.BoxGeometry(1.0, 0.26, 0.34), m.iron, [-0.9, 0.8, 4.6]);
  add(group, new THREE.ConeGeometry(0.26, 0.4, 4), m.iron, [-1.5, 0.85, 4.6], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 5; i++) add(group, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), m.iron,
    [1.9 + i * 0.16, 1.1, 5.4 + i * 0.05], [0.28, 0, 0.1]);
  add(group, new THREE.IcosahedronGeometry(0.72, 0), m.coal, [2.7, 0.42, 3.6]);
  add(group, new THREE.IcosahedronGeometry(0.48, 0), m.coal, [3.3, 0.3, 4.2], [0.4, 0.9, 0]);
}

/** Grain must stay dry, so the floor is lifted clear of the ground and loaded from a hoist. */
function granary(group, m) {
  for (const sx of [-1.7, 0, 1.7]) for (const sz of [-1.5, 1.5]) {
    add(group, new THREE.CylinderGeometry(0.22, 0.3, 0.85, 8), m.stone, [sx, 0.42, sz]);
    add(group, new THREE.CylinderGeometry(0.52, 0.36, 0.2, 12), m.stone, [sx, 0.95, sz]);
  }
  add(group, new THREE.BoxGeometry(5.0, 0.24, 4.6), m.darkTimber, [0, 1.17, 0]);
  walls(group, { width: 4.6, depth: 4.2, height: 2.6, y: 1.29, wall: m.plasterAlt, timber: m.timber });
  curlRoof(group, m.thatch, { width: 4.8, depth: 4.2, height: 2.3, overhang: 0.7, y: 3.89 });
  for (const sz of [-1, 1]) gable(group, m.timber, { width: 4.8, height: 2.3, y: 3.89, z: sz * 2.02 });
  add(group, new THREE.BoxGeometry(0.95, 1.7, 0.12), m.darkTimber, [0, 2.14, 2.12]);
  for (const shift of [-1.4, 1.4]) add(group, new THREE.BoxGeometry(0.16, 0.75, 0.1), m.darkTimber, [shift, 2.9, 2.14]);
  add(group, new THREE.BoxGeometry(0.24, 0.24, 2.9), m.timber, [0, 5.0, 2.3]); // hoist beam over the lane
  add(group, new THREE.TorusGeometry(0.2, 0.05, 6, 12), m.iron, [0, 4.78, 3.5], [0, Math.PI / 2, 0]);
  add(group, new THREE.CylinderGeometry(0.025, 0.025, 2.1, 5), m.iron, [0, 3.7, 3.55]);
  add(group, new THREE.TorusGeometry(0.16, 0.04, 6, 10), m.iron, [0, 2.6, 3.55], [0, Math.PI / 2, 0]);
  for (const sx of [-0.35, 0.35]) add(group, new THREE.CylinderGeometry(0.06, 0.06, 2.3, 5), m.timber, [sx, 1.1, 2.6], [0.24, 0, 0]);
  for (let i = 0; i < 4; i++) add(group, new THREE.BoxGeometry(0.8, 0.06, 0.08), m.timber, [0, 0.35 + i * 0.52, 2.83 - i * 0.13]);
}

/** Still, clean air: the tallest gable, louvred on every face, with racks drying in the wind. */
function loft(group, m) {
  walls(group, { width: 4, depth: 4, height: 6.3, wall: m.plaster, timber: m.timber });
  curlRoof(group, m.thatch, { width: 4.2, depth: 4, height: 3.3, overhang: 0.65, y: 6.3 });
  for (const sz of [-1, 1]) gable(group, m.plasterAlt, { width: 4.2, height: 3.3, y: 6.3, z: sz * 1.92 });
  for (let i = 0; i < 6; i++) {
    const y = 3.9 + i * 0.38;
    for (const sz of [-1, 1]) add(group, new THREE.BoxGeometry(3.4, 0.1, 0.22), m.darkTimber, [0, y, sz * 2.06], [0.42 * sz, 0, 0]);
    for (const sx of [-1, 1]) add(group, new THREE.BoxGeometry(0.22, 0.1, 3.4), m.darkTimber, [sx * 2.06, y, 0], [0, 0, -0.42 * sx]);
  }
  door(group, { z: 2.05, timber: m.darkTimber, glow: m.glow, width: 0.95 });
  window_(group, { axis: 'z', sign: 1, offset: 2.0, y: 3.0, shift: 1.1, timber: m.timber, glow: m.glow, width: 0.5 });
  window_(group, { axis: 'x', sign: 1, offset: 2.0, y: 2.4, timber: m.timber, glow: m.glow, width: 0.5 });
  add(group, new THREE.BoxGeometry(2.6, 0.16, 1.1), m.timber, [0, 5.2, 2.4]); // balcony the moths leave from
  for (const sx of [-1.2, 1.2]) add(group, new THREE.CylinderGeometry(0.07, 0.07, 0.9, 5), m.timber, [sx, 5.6, 2.85]);
  add(group, new THREE.BoxGeometry(2.6, 0.09, 0.09), m.timber, [0, 6.0, 2.85]);
  lantern(group, { position: [1.4, 3.4, 2.3], iron: m.iron, flame: m.flame, size: 0.13 });
  for (const sx of [3.3, 4.6]) { // drying racks
    add(group, new THREE.BoxGeometry(0.12, 2.4, 0.12), m.timber, [sx, 1.2, -1.2]);
    add(group, new THREE.BoxGeometry(0.12, 2.4, 0.12), m.timber, [sx, 1.2, 1.2]);
    add(group, new THREE.BoxGeometry(0.1, 0.1, 2.6), m.timber, [sx, 2.35, 0]);
    add(group, new THREE.PlaneGeometry(2.2, 1.5), m.cloth, [sx - 0.02, 1.5, 0], [0, Math.PI / 2, 0]);
  }
}

/** Dwellings: the same joinery at domestic size, each leaning a little differently. */
function cottage(group, m, variant = 0) {
  const width = variant ? 4.2 : 4.4, depth = variant ? 3.6 : 3.8, side = variant ? -1 : 1;
  walls(group, { width, depth, height: 2.5, wall: variant ? m.plasterAlt : m.plaster, timber: m.timber });
  curlRoof(group, m.thatch, { width: width + 0.2, depth, height: 2.45, overhang: 0.65, y: 2.5 });
  for (const sz of [-1, 1]) gable(group, m.timber, { width: width + 0.2, height: 2.45, y: 2.5, z: sz * (depth / 2 + 0.02) });
  door(group, { z: depth / 2 + 0.02, timber: m.darkTimber, glow: m.glow, width: 0.95 });
  window_(group, { axis: 'z', sign: 1, offset: depth / 2, y: 1.75, shift: 1.35, timber: m.timber, glow: m.glow, width: 0.55 });
  window_(group, { axis: 'x', sign: side, offset: width / 2, y: 1.7, timber: m.timber, glow: m.glow, width: 0.55 });
  add(group, new THREE.BoxGeometry(0.75, 3.4, 0.75), m.stone, [side * (width / 2 - 0.5), 3.0, -0.9], [0, 0, side * 0.11]);
  add(group, new THREE.BoxGeometry(1.7, 0.09, 0.42), m.timber, [-side * 1.1, 0.47, depth / 2 + 0.75]);
  for (const sx of [-0.7, 0.7]) add(group, new THREE.BoxGeometry(0.1, 0.45, 0.36), m.timber, [-side * 1.1 + sx, 0.24, depth / 2 + 0.75]);
  if (!variant) for (let i = 0; i < 8; i++) {
    add(group, new THREE.CylinderGeometry(0.11, 0.11, 0.85, 6), m.timber,
      [width / 2 + 0.55, 0.13 + Math.floor(i / 3) * 0.23, -0.9 + (i % 3) * 0.25], [0, 0, Math.PI / 2]);
  }
  lantern(group, { position: [0.85, 2.1, depth / 2 + 0.5], iron: m.iron, flame: m.flame, size: 0.12, drop: 0.35 });
}

export const PROGRAMS = {
  beacon, hall, mill, smithy, granary, loft,
  cottage: (group, m) => cottage(group, m, 0),
  cottageAlt: (group, m) => cottage(group, m, 1)
};
