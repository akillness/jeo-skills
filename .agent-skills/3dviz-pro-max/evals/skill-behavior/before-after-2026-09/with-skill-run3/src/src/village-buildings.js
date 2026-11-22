// village-buildings.js - the ten structures of Threadwater Hollow, assembled from the kit
// blueprints and placed on the seeded plan. Six sit on plots chosen by layout/place(); the
// tower, the mill and the bridge are sited by hand because the terrain, not the plan, decides
// where a landmark, a waterwheel and a crossing belong.
import * as THREE from 'three';
import { place } from '../kits/layout/village-layout.js';
import { create as timberCottage } from '../kits/buildings/timber-cottage.js';
import { create as longHall } from '../kits/buildings/long-hall.js';
import { create as marketStall } from '../kits/buildings/market-stall.js';
import { create as roundTower } from '../kits/buildings/round-tower.js';
import { create as watermill } from '../kits/buildings/watermill.js';
import { create as stoneBridge } from '../kits/buildings/stone-bridge.js';
import { riverCentreX } from './terrain-felt-ground.js';
import { VILLAGE } from './look.js';

// Six plot-placed structures, largest first: place() hands out the smallest plot that still fits.
const ON_PLOTS = [
  { id: 'moot-hall', name: 'The Moot Hall', role: 'long hall, five bays',
    blurb: 'Where the hollow argues. Two doors, two chimneys, and a porch that breaks the eave line.',
    build: () => longHall({ width: 8, depth: 4.5, wallHeight: 3.1, bayCount: 5, seed: 3 }),
    footprint: [8, 4.5] },
  { id: 'chandler', name: "Chandler's House", role: 'two-storey cottage',
    blurb: 'The tallest roof on the lane before the tower. Tallow smoke, and candles in every window.',
    build: () => timberCottage({ width: 5, depth: 4, storeys: 2, roofPitchDeg: 46, seed: 12 }),
    footprint: [5, 4] },
  { id: 'thatcher-barn', name: "Thatcher's Barn", role: 'three-bay barn',
    blurb: 'Low walls, long ridge, wide doors. Reed bundles from the river bank dry inside.',
    build: () => longHall({ width: 6, depth: 4.2, wallHeight: 2.7, bayCount: 3, seed: 21 }),
    footprint: [6, 4.2] },
  { id: 'weaver', name: "Weaver's Cottage", role: 'timber cottage',
    blurb: 'Two bays of framed timber. The loom stands against the gable wall, out of the light.',
    build: () => timberCottage({ width: 4.2, depth: 3.4, storeys: 1, seed: 5 }),
    footprint: [4.2, 3.4] },
  { id: 'dyer', name: "Dyer's Cottage", role: 'timber cottage',
    blurb: 'Steeper pitch, older frame. The vats out back are what dye the hollow its one red.',
    build: () => timberCottage({ width: 4.2, depth: 3.4, storeys: 1, roofPitchDeg: 48, seed: 31 }),
    footprint: [4.2, 3.4] },
  { id: 'fruit-stall', name: 'The Fruit Stall', role: 'trestle market stall',
    blurb: 'Striped canopy with a sagging ridge; crates of hill fruit stacked under the counter.',
    build: () => marketStall({ width: 2.5, depth: 1.9, stripes: 8, seed: 8 }),
    footprint: [2.5, 1.9] },
  { id: 'cloth-stall', name: 'The Cloth Stall', role: 'trestle market stall',
    blurb: 'Bolts of dyed felt, a price board on iron hooks, and rope lashings at every post head.',
    build: () => marketStall({ width: 2.5, depth: 1.9, stripes: 6, seed: 17 }),
    footprint: [2.5, 1.9] }
];

/** World-space focus point and reach for a finished structure, read off its own bounding box. */
function framing(group) {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3(), centre = new THREE.Vector3();
  box.getSize(size); box.getCenter(centre);
  return { focus: [centre.x, box.min.y + size.y * 0.55, centre.z],
           reach: Math.max(size.x, size.z, size.y) * 0.5, height: size.y };
}

/** Where the main lane meets the river: the one place a bridge belongs. */
function crossing(plan) {
  const lane = plan.paths[0].points;
  let best = { distance: Infinity };
  for (let i = 1; i < lane.length; i++) {
    const [ax, az] = lane[i - 1], [bx, bz] = lane[i];
    for (let s = 0; s <= 40; s++) {
      const t = s / 40, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const distance = Math.abs(x - riverCentreX(z));
      if (distance < best.distance) best = { distance, x, z, dx: bx - ax, dz: bz - az };
    }
  }
  return best;
}

/** A knoll for the landmark: off the lanes, on ground the hills actually lifted. */
function knoll(heightAt, plan) {
  let best = null;
  for (let i = 0; i < 360; i++) {
    const angle = (i / 360) * Math.PI * 2, radius = 15 + (i % 7);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (Math.abs(x - riverCentreX(z)) < 8) continue;
    const y = heightAt(x, z);
    const clear = plan.plots.every(p => Math.hypot(p.position[0] - x, p.position[1] - z) > 9);
    if (!clear || y < 1.2) continue;
    if (!best || y > best.y) best = { x, y, z };
  }
  return best ?? { x: -16, y: heightAt(-16, -9), z: -9 };
}

/**
 * Builds and sites every structure.
 * @returns {{group: THREE.Group, entries: object[], animate: (dt: number) => boolean}}
 */
export function createBuildings({ plan, heightAt }) {
  const group = new THREE.Group();
  const entries = [], animators = [];
  const taken = new Set();

  for (const spec of ON_PLOTS) {
    const slot = place(plan, spec.footprint, taken);
    if (!slot) continue;
    taken.add(slot.index);
    const built = spec.build();
    const [x, z] = slot.position;
    built.group.position.set(x, heightAt(x, z), z);
    built.group.rotation.y = slot.yawRad;          // the plot already faces its lane
    group.add(built.group);
    entries.push({ ...spec, group: built.group, sockets: built.sockets, ...framing(built.group) });
    if (built.animate) animators.push(built.animate);
  }

  // Landmark: twice the height of its neighbours, on the highest clear knoll.
  const hill = knoll(heightAt, plan);
  const tower = roundTower({ height: 10.5, baseRadius: 2.1, topRadius: 1.7, merlons: 14, seed: 4 });
  tower.group.position.set(hill.x, hill.y - 0.15, hill.z);
  tower.group.rotation.y = Math.atan2(-hill.x, -hill.z);      // the door faces the village
  group.add(tower.group);
  entries.push({ id: 'tower', name: 'Emberwatch Tower', role: 'battered round tower, 10.5 m',
                 blurb: 'The one curved mass in the hollow, and twice the height of any roof. A banner, a brazier, and a stair that runs outside the wall.',
                 group: tower.group, sockets: tower.sockets, ...framing(tower.group) });

  // Mill: on the west bank, wheel overhanging the gorge, launder feeding it from above.
  // The bank stretch it takes is the first one no plot has already claimed.
  const millZ = [3.4, -4.2, 8.6, -9.8, 13.5, -14.6].find(z => plan.plots.every(plot =>
    Math.hypot(plot.position[0] - (riverCentreX(z) - 6.9), plot.position[1] - z) > 8)) ?? 3.4;
  const millX = riverCentreX(millZ) - 6.9;
  const mill = watermill({ width: 6, depth: 4.5, wheelRadius: 1.6, paddles: 14,
                           speedRadPerSec: 0.5, seed: 6 });
  mill.group.position.set(millX, heightAt(millX, millZ), millZ);
  group.add(mill.group);
  animators.push(mill.animate);
  entries.push({ id: 'mill', name: 'Threadwater Mill', role: 'stone mill, overshot wheel',
                 blurb: 'The only thing here that turns on its own. The launder carries water over the top of the wheel; the hoist beam lifts sacks to the loading door.',
                 group: mill.group, sockets: mill.sockets, ...framing(mill.group) });

  // Bridge: deck top lands exactly on lane level (deckY = springHeight + rise + 0.525).
  const cross = crossing(plan);
  const deckY = 0.6 + 1.0 + 0.525;
  const bridge = stoneBridge({ span: 6, width: 3.4, rise: 1.0, springHeight: 0.6,
                               voussoirCount: 15, approach: 2.2, seed: 9 });
  bridge.group.position.set(riverCentreX(cross.z), -deckY, cross.z);
  bridge.group.rotation.y = Math.atan2(-cross.dz, cross.dx);
  group.add(bridge.group);
  entries.push({ id: 'bridge', name: 'Stitchspan Bridge', role: 'single segmental arch, 6 m span',
                 blurb: 'Fifteen voussoirs and a raised keystone. The lane stops at the gorge on both sides and picks up again on the far bank.',
                 group: bridge.group, sockets: bridge.sockets, ...framing(bridge.group) });

  for (const entry of entries) entry.group.userData.buildingId = entry.id;
  return {
    group, entries,
    animate(dt) {
      if (!(dt > 0)) return false;
      let moved = false;
      for (const animate of animators) moved = animate(dt) || moved;
      return moved;
    }
  };
}
