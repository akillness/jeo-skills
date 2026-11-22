// village-dressing.js - everything that is not a building: lane lanterns and their practicals,
// the props that say the hollow is lived in, and the planting that gives the frame its three
// depth layers. Props hang off building sockets and positions rather than off magic world
// coordinates, so moving a building moves its own well, cart and washing line with it.
import * as THREE from 'three';
import { seeded } from '../kits/kit-core.js';
import { create as lanternPost } from '../kits/props/lantern-post.js';
import { create as well } from '../kits/props/well.js';
import { create as cart } from '../kits/props/cart.js';
import { create as barrel } from '../kits/props/barrel.js';
import { create as crate } from '../kits/props/crate.js';
import { create as fenceRun } from '../kits/props/fence-run.js';
import { create as clothesline } from '../kits/props/clothesline.js';
import { create as signboard } from '../kits/props/signboard.js';
import { create as treeRound } from '../kits/nature/tree-round.js';
import { create as treeConifer } from '../kits/nature/tree-conifer.js';
import { create as rockCluster } from '../kits/nature/rock-cluster.js';
import { create as reeds } from '../kits/nature/reeds.js';
import { riverCentreX } from './terrain-felt-ground.js';
import { LOOK, VILLAGE } from './look.js';

const MAX_PRACTICALS = 8;   // dynamic lights are capped; every other emissive glows on its own

/** Adds one built kit at a world point, dropped onto the ground and yawed. */
function drop(group, built, { x, z, y, yaw = 0 }, heightAt) {
  built.group.position.set(x, y ?? heightAt(x, z), z);
  built.group.rotation.y = yaw;
  group.add(built.group);
  return built;
}

/** Lane lanterns: one every ~8 m of main lane, the first eight carrying a real PointLight. */
function lanterns(group, plan, heightAt, animators) {
  const lane = plan.paths[0].points, lights = [];
  const stops = [];
  for (let i = 1; i < lane.length; i++) {
    const [ax, az] = lane[i - 1], [bx, bz] = lane[i];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 8));
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      stops.push([ax + (bx - ax) * t + 2.1, az + (bz - az) * t + 1.5]);
    }
  }
  stops.forEach(([x, z], index) => {
    if (Math.abs(x - riverCentreX(z)) < VILLAGE.riverEdge + 1) return;
    const post = drop(group, lanternPost({ seed: 40 + index, glass: LOOK.palette.lamp }),
                      { x, z, yaw: index * 1.1 }, heightAt);
    const lamp = post.sockets.find(socket => socket.name === 'lamp') ?? post.sockets[0];
    if (lights.length >= MAX_PRACTICALS) return;
    // 34 cd, decay 2, 9 m reach: the falloff has to be visible on the lane or the light is decor.
    const light = new THREE.PointLight(LOOK.palette.lamp, 34, 9, 2);
    light.position.set(...lamp.position_m);
    post.group.add(light);
    lights.push({ light, phase: index * 1.7, base: 34 });
  });
  // A lantern that does not breathe reads as a decal; the flicker is small and slow on purpose.
  let time = 0;
  animators.push(dt => {
    time += dt;
    for (const entry of lights) {
      entry.light.intensity = entry.base * (0.92 + 0.08 * Math.sin(time * 1.9 + entry.phase));
    }
    return lights.length > 0;
  });
  return lights.length;
}

/** Props sited off the buildings they belong to. `front` is the plot's +Z, its door normal. */
function props(group, entries, heightAt, animators) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const at = (id, forward, side, extra = {}) => {
    const entry = byId.get(id);
    if (!entry) return null;
    const yaw = entry.group.rotation.y;
    const x = entry.group.position.x + Math.sin(yaw) * forward + Math.cos(yaw) * side;
    const z = entry.group.position.z + Math.cos(yaw) * forward - Math.sin(yaw) * side;
    return { x, z, yaw: yaw + (extra.turn ?? 0) };
  };
  const put = (built, spot) => { if (spot) drop(group, built, spot, heightAt); return built; };

  put(well({ seed: 2 }), at('moot-hall', 5.2, -1.4));
  put(signboard({ seed: 7 }), at('moot-hall', 3.1, 3.2));
  put(clothesline({ span: 4.2, sheets: 5, seed: 11 }), at('weaver', 3.4, 0, { turn: 1.1 }));
  put(fenceRun({ length_m: 5.4, posts: 5, seed: 13 }), at('thatcher-barn', 4.2, -2.6, { turn: 1.57 }));
  put(fenceRun({ length_m: 5.4, posts: 5, seed: 14 }), at('thatcher-barn', 4.2, 2.8, { turn: 1.57 }));
  const rolling = put(cart({ seed: 15 }), at('fruit-stall', 3.6, 2.4, { turn: 0.4 }));
  const parked = put(cart({ seed: 16, width: 1.6 }), at('mill', -4.4, 3.2, { turn: 2.1 }));
  const random = seeded(99);
  for (const [id, count] of [['mill', 5], ['fruit-stall', 4], ['cloth-stall', 3], ['moot-hall', 3]]) {
    for (let i = 0; i < count; i++) {
      const spot = at(id, 3.4 + random() * 2.4, (random() - 0.5) * 6.5, { turn: random() * 6.28 });
      put(random() > 0.45 ? barrel({ seed: 60 + i }) : crate({ seed: 70 + i, size: 0.58 }), spot);
    }
  }
  if (rolling?.animate) {
    // The cart is being pulled at a walk: 0.9 m/s turns the wheels at their true rate.
    let t = 0;
    animators.push(dt => { t += dt; rolling.animate(dt, 0.9 * (0.6 + 0.4 * Math.sin(t * 0.5))); return true; });
  }
  return parked;
}

/** Planting: trees on the hills the village never levelled, reeds on the wet shoulder. */
function planting(group, plan, heightAt, animators) {
  const random = seeded(4242);
  const swayers = [];
  for (let i = 0; i < 34; i++) {
    const angle = random() * Math.PI * 2, radius = 12 + random() * 38;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const y = heightAt(x, z);
    if (y < 0.55 || Math.abs(x - riverCentreX(z)) < VILLAGE.riverEdge + 2) continue;
    const conifer = random() > 0.55;
    const tree = conifer
      ? treeConifer({ seed: 100 + i, age: 0.6 + random() * 0.6, height: 4.6 + random() * 2.6 })
      : treeRound({ seed: 200 + i, age: 0.5 + random() * 0.7, height: 3.4 + random() * 2.2 });
    drop(group, tree, { x, z, y, yaw: random() * 6.28 }, heightAt);
    swayers.push({ item: tree, strength: 0.028 });
  }
  // Three trees inside the hollow itself, so the village is not a bald clearing.
  for (const [x, z, seed] of [[-6.2, 6.4, 301], [4.8, -7.1, 302], [-13.5, -2.2, 303]]) {
    const tree = treeRound({ seed, age: 1, height: 4.4, lean: 0.12 });
    drop(group, tree, { x, z }, heightAt);
    swayers.push({ item: tree, strength: 0.034 });
  }
  for (let i = 0; i < 7; i++) {
    const z = -26 + i * 8.5 + random() * 3;
    const side = i % 2 === 0 ? -1 : 1;
    const x = riverCentreX(z) + side * (VILLAGE.riverEdge - 0.5 + random() * 0.8);
    const bed = reeds({ count: 34, seed: 400 + i, spread: 0.9, height: 1.1 + random() * 0.5 });
    drop(group, bed, { x, z, yaw: random() * 6.28 }, heightAt);
    swayers.push({ item: bed, strength: 1 });
  }
  for (let i = 0; i < 9; i++) {
    const angle = random() * Math.PI * 2, radius = 9 + random() * 34;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (heightAt(x, z) < 0.3 && Math.abs(x - riverCentreX(z)) > VILLAGE.riverEdge) continue;
    drop(group, rockCluster({ count: 5 + Math.round(random() * 4), seed: 500 + i,
                              spread: 0.9 + random() * 0.9 }), { x, z, yaw: random() * 6.28 }, heightAt);
  }
  animators.push(dt => {
    let moved = false;
    for (const { item, strength } of swayers) moved = item.animate(dt, strength) || moved;
    return moved;
  });
}

/** @returns {{group: THREE.Group, practicals: number, animate: (dt:number)=>boolean}} */
export function createDressing({ plan, heightAt, entries }) {
  const group = new THREE.Group();
  const animators = [];
  const practicals = lanterns(group, plan, heightAt, animators);
  props(group, entries, heightAt, animators);
  planting(group, plan, heightAt, animators);
  return {
    group, practicals,
    animate(dt) {
      if (!(dt > 0)) return false;
      let moved = false;
      for (const animate of animators) moved = animate(dt) || moved;
      return moved;
    }
  };
}
