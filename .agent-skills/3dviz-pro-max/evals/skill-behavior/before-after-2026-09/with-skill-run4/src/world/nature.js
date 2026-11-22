// nature.js - the planting: broadleaf trees and reeds that sway (so the far field is never a
// frozen backdrop), conifers on the bluff, rock clusters on the banks, and one instanced field
// of canopy lobes for the far hills - T1, one draw call, per-instance position, rotation, scale
// and hue jitter, never wrapped in a LOD (a LOD per repeat removes no draws).
import { THREE, scatterInstances, seeded } from '../kits/kit-core.js';
import { create as treeRound } from '../kits/nature/tree-round.js';
import { create as treeConifer } from '../kits/nature/tree-conifer.js';
import { create as reeds } from '../kits/nature/reeds.js';
import { create as rockCluster } from '../kits/nature/rock-cluster.js';
import { WATER_Y, riverX } from './terrain.js';

const BROADLEAF = [[-21, -6.5, 3.9], [-16.5, -8.5, 3.2], [-24.5, 8, 4.4], [-10.5, 12.5, 3.6],
                   [-2.5, 10.5, 3.1], [4.5, 8.5, 3.4], [-27, -1.5, 4.1]];
const CONIFER = [[22.5, -1.5, 5.2], [24.5, 3.5, 4.6], [21, 12.5, 5.6], [26, 9, 4.2],
                 [17.5, 14, 4.8]];
const ROCKS = [[3.2, 6.5, 1.0], [2.0, -17.5, 1.2], [12.0, -9.5, 0.95], [11.4, 11.5, 1.1]];
const REED_Z = [-19, -14.5, -8.5, -3.5, 4.5, 9.5, 15.5, 19.5];

/** Walk out from the channel centre until the ground rises past the water line. */
function shorelineX(heightAt, z, side) {
  const start = riverX(z);
  for (let step = 0; step < 90; step++) {
    const x = start + side * (1.5 + step * 0.12);
    if (heightAt(x, z) > WATER_Y - 0.02) return x;
  }
  return start + side * 6;
}

export function createNature(heightAt) {
  const group = new THREE.Group();
  const random = seeded(31337);
  const animators = [];
  let lobe = null;

  const drop = (kit, x, z, { yaw = random() * Math.PI * 2, y = null } = {}) => {
    kit.group.position.set(x, y ?? heightAt(x, z), z);
    kit.group.rotation.y = yaw;
    group.add(kit.group);
    if (typeof kit.animate === 'function') animators.push(kit.animate);
    return kit;
  };

  BROADLEAF.forEach(([x, z, height], index) => {
    const kit = treeRound({ seed: 40 + index * 7, height, lean: 0.06 + random() * 0.08,
                            age: 0.85 + random() * 0.4 });
    if (!lobe) lobe = kit.instancing;
    drop(kit, x, z);
  });
  CONIFER.forEach(([x, z, height], index) =>
    drop(treeConifer({ seed: 70 + index * 5, height, lean: 0.04 + random() * 0.06 }), x, z));
  ROCKS.forEach(([x, z, spread], index) =>
    drop(rockCluster({ seed: 11 + index * 13, count: 6 + Math.floor(random() * 4), spread }), x, z));

  for (const z of REED_Z) {
    for (const side of [-1, 1]) {
      if (side > 0 && random() < 0.45) continue;
      const x = shorelineX(heightAt, z + (random() - 0.5) * 2.4, side);
      drop(reeds({ seed: Math.floor(random() * 800) + 1, count: 26 + Math.floor(random() * 16),
                   spread: 0.7 + random() * 0.5, height: 1.05 + random() * 0.5 }),
           x, z, { y: heightAt(x, z) - 0.06 });
    }
  }

  // Far-field scrub: one InstancedMesh of canopy lobes on the hills the lanes never reach.
  const placements = [];
  for (let i = 0; i < 90 && placements.length < 64; i++) {
    const angle = random() * Math.PI * 2, radius = 26 + random() * 34;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const y = heightAt(x, z);
    if (y < 0.4 || Math.abs(x - riverX(z)) < 7) continue;
    const scale = 0.7 + random() * 1.5;
    placements.push({ position: [x, y + scale * 0.22, z],
                      rotation: [0, random() * Math.PI * 2, (random() - 0.5) * 0.2],
                      scale: [scale, scale * (0.7 + random() * 0.5), scale],
                      hue: (random() - 0.5) * (lobe?.hueJitter ?? 0.1) });
  }
  if (lobe) group.add(scatterInstances(lobe.geometry, lobe.material, placements));

  return {
    group,
    /** Trees and reeds bend on their own phases; nothing here reads the wall clock. */
    animate(dt) {
      if (dt <= 0) return false;
      let moved = false;
      for (const animate of animators) moved = animate(dt) || moved;
      return moved;
    }
  };
}
