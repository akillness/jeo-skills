// props.js - the bridge (the only large curved mass in the village), the moored ferries and the
// mill wheel. Change BRIDGE_RISE and the arch radius together: the arch springs at the waterline
// only while radius * (1 - cos(ARC/2)) still equals the deck rise.
import * as THREE from 'three';
import { heightAt, bankZ, riverCenter, WATER_Y } from './terrain.js';

const BRIDGE_X = 0, BRIDGE_HALF = 14, BRIDGE_TOP = 3.4, BRIDGE_RISE = 2.1, DECK_W = 4.2;
const ARCH_RADIUS = 11, ARCH_ARC = 1.6;

/** Deck height above the water at a river offset; a shallow parabola landing on both banks. */
export function deckY(off) {
  const t = off / BRIDGE_HALF;
  return BRIDGE_TOP - BRIDGE_RISE * t * t;
}

/**
 * The Long Step: 28 pitched deck planks, two segmental arch rings, and railing posts.
 * @returns {{group: THREE.Group, lanternSpots: number[][]}} spots are [x, y, z] for lanterns.
 */
export function createBridge(materials) {
  const group = new THREE.Group();
  const segments = 28, span = (BRIDGE_HALF * 2) / segments;
  const plank = new THREE.BoxGeometry(DECK_W, 0.34, span * 1.06);
  for (let i = 0; i < segments; i++) {
    const off = -BRIDGE_HALF + (i + 0.5) * span;
    const slope = (deckY(off + 0.3) - deckY(off - 0.3)) / 0.6;
    const mesh = new THREE.Mesh(plank, materials.plank);
    mesh.position.set(BRIDGE_X, deckY(off), bankZ(BRIDGE_X, off));
    mesh.rotation.x = -Math.atan(slope);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  const arch = new THREE.TorusGeometry(ARCH_RADIUS, 0.42, 8, 30, ARCH_ARC);
  arch.rotateZ(Math.PI / 2 - ARCH_ARC / 2);
  arch.rotateY(Math.PI / 2);
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(arch, materials.stone);
    mesh.position.set(BRIDGE_X + side * (DECK_W / 2 - 0.35), BRIDGE_TOP - 0.35 - ARCH_RADIUS, riverCenter(BRIDGE_X));
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Abutments: the deck lands on masonry, not on air, at both ends.
  const abutment = new THREE.BoxGeometry(DECK_W + 1.6, 3.2, 3.4);
  for (const end of [-1, 1]) {
    const off = end * (BRIDGE_HALF - 1.2);
    const mesh = new THREE.Mesh(abutment, materials.stone);
    mesh.position.set(BRIDGE_X, deckY(off) - 1.75, bankZ(BRIDGE_X, off));
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  const post = new THREE.BoxGeometry(0.13, 1.0, 0.13);
  const rail = new THREE.BoxGeometry(0.1, 0.1, span * 8);
  const lanternSpots = [];
  for (let i = -6; i <= 6; i++) {
    const off = i * 2.2;
    const y = deckY(off), z = bankZ(BRIDGE_X, off);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(post, materials.plank);
      mesh.position.set(BRIDGE_X + side * (DECK_W / 2 - 0.14), y + 0.6, z);
      mesh.castShadow = true;
      group.add(mesh);
      if (i % 3 === 0) lanternSpots.push([mesh.position.x, y + 1.35, z]);
    }
    if (i % 4 === 0 && i < 6) {
      const bar = new THREE.Mesh(rail, materials.plank);
      bar.position.set(BRIDGE_X, y + 1.02, bankZ(BRIDGE_X, off + 4.4));
      bar.rotation.x = -Math.atan((deckY(off + 8.8) - deckY(off)) / 8.8);
      group.add(bar);
    }
  }
  return { group, lanternSpots };
}

/**
 * Moored ferries. Hull 4.5 m - the stated scale cue on the water.
 * @returns {{group, update(time), dispose()}}
 */
export function createBoats(materials, moorings) {
  const group = new THREE.Group();
  const hull = new THREE.CapsuleGeometry(0.62, 3.2, 4, 14);
  hull.rotateZ(Math.PI / 2);
  hull.scale(1, 0.55, 1);
  const bench = new THREE.BoxGeometry(0.9, 0.1, 1.1);
  const mast = new THREE.CylinderGeometry(0.05, 0.06, 2.0, 6);
  const boats = [];
  moorings.forEach((mooring, index) => {
    const boat = new THREE.Group();
    const body = new THREE.Mesh(hull, materials.plank);
    body.castShadow = true; boat.add(body);
    const seat = new THREE.Mesh(bench, materials.timber);
    seat.position.y = 0.28; boat.add(seat);
    const pole = new THREE.Mesh(mast, materials.timber);
    pole.position.set(-1.4, 1.0, 0); boat.add(pole);
    const z = bankZ(mooring[0], mooring[1]);
    boat.position.set(mooring[0], WATER_Y + 0.12, z);
    boat.rotation.y = mooring[2] ?? 0;
    boat.userData = { phase: index * 2.1, home: boat.position.y };
    group.add(boat); boats.push(boat);
  });
  return {
    group,
    /** 5.5 s bob at 2 cm, plus a 1.2 deg roll - the style record's boat timing. */
    update(time) {
      for (const boat of boats) {
        const p = boat.userData.phase;
        boat.position.y = boat.userData.home + Math.sin((time / 5.5) * Math.PI * 2 + p) * 0.02;
        boat.rotation.z = Math.sin((time / 4.1) * Math.PI * 2 + p) * 0.021;
      }
    },
    dispose() { hull.dispose(); bench.dispose(); mast.dispose(); }
  };
}

/**
 * Undershot mill wheel, 4.4 m across, dipping into the current. It turns whenever the river does.
 * @returns {{group, update(dt), dispose()}}
 */
export function createMillWheel(materials, x, off) {
  const group = new THREE.Group();
  const z = bankZ(x, off);
  group.position.set(x, WATER_Y + 1.55, z);
  const rim = new THREE.TorusGeometry(2.2, 0.14, 6, 24);
  rim.rotateY(Math.PI / 2);
  for (const side of [-0.5, 0.5]) {
    const mesh = new THREE.Mesh(rim, materials.timber);
    mesh.position.x = side; mesh.castShadow = true; group.add(mesh);
  }
  const paddle = new THREE.BoxGeometry(1.5, 0.9, 0.1);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const mesh = new THREE.Mesh(paddle, materials.plank);
    mesh.position.set(0, Math.sin(angle) * 1.95, Math.cos(angle) * 1.95);
    mesh.rotation.x = -angle;
    mesh.castShadow = true;
    group.add(mesh);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.4, 8), materials.timber);
  axle.rotation.z = Math.PI / 2;
  group.add(axle);
  const support = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), materials.timber);
  support.position.set(0.9, -1.0, -1.4);
  group.add(support);
  return {
    group,
    update(dt) { group.rotation.x += dt * 0.42; },   // ~4 rpm; slow enough to read as water-driven
    dispose() { rim.dispose(); paddle.dispose(); }
  };
}

/** Wet quay strip at the south bank waterline: roughness 0.3 against the 0.62 of the ground. */
export function createQuay(materials) {
  const group = new THREE.Group();
  const slab = new THREE.BoxGeometry(6.2, 0.9, 5.4);
  for (let i = 0; i < 7; i++) {
    const x = -16 + i * 6.1;
    const off = 8.9;
    const mesh = new THREE.Mesh(slab, materials.wetStone);
    mesh.position.set(x, heightAt(x, bankZ(x, off)) - 0.1, bankZ(x, off));
    mesh.rotation.y = (riverCenter(x + 3) - riverCenter(x - 3)) / 6 * -1;
    mesh.receiveShadow = true; mesh.castShadow = true;
    group.add(mesh);
  }
  return { group, dispose() { slab.dispose(); } };
}
