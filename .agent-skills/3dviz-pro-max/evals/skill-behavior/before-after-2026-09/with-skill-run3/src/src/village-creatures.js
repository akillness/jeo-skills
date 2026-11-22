// village-creatures.js - four walkers that keep the hollow alive. The gait is procedural, not
// clip data: kit-walk advances the phase by distance travelled / stride length, so a planted
// foot holds its world position instead of skating. Routes are cut from the lanes themselves,
// which is what keeps a walker out of a building the seeded plan put somewhere else.
import { create as biped } from '../kits/creatures/biped-walker.js';
import { create as quadruped } from '../kits/creatures/quadruped-walker.js';
import { riverCentreX } from './terrain-felt-ground.js';
import { LOOK, VILLAGE } from './look.js';

const finish = (points, reverse) => (reverse ? points.slice().reverse() : points);

/**
 * A walkable route from a lane: resampled every ~2 m, pushed `offset` metres to one side, and
 * cut short of the gorge, which only the bridge crosses.
 */
function routeFromPath(path, { offset = 0, reverse = false } = {}) {
  const points = [];
  for (let i = 1; i < path.points.length; i++) {
    const [ax, az] = path.points[i - 1], [bx, bz] = path.points[i];
    const length = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.round(length / 2.2));
    const nx = (bz - az) / length, nz = -(bx - ax) / length;    // lane normal, in the ground plane
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t + nx * offset, z = az + (bz - az) * t + nz * offset;
      // Truncate rather than skip: a filtered-out point in the middle would let a walker step
      // straight over the gorge instead of stopping at the bank the way the lane does.
      if (Math.abs(x - riverCentreX(z)) < VILLAGE.riverEdge + 2.6) return finish(points, reverse);
      if (Math.hypot(x, z) > VILLAGE.radius + 4) return finish(points, reverse);
      points.push([x, z]);
    }
  }
  return finish(points, reverse);
}

const CAST = [
  { id: 'carter', kind: 'biped', path: 0, offset: 0.95, reverse: false, speed: 1.15,
    options: { tunic: LOOK.palette.accent, scale: 1.02, seed: 3 } },
  { id: 'miller', kind: 'biped', path: 0, offset: -1.05, reverse: true, speed: 0.92,
    options: { tunic: LOOK.palette.sage, scale: 0.97, seed: 11 } },
  { id: 'goat', kind: 'quadruped', path: 1, offset: 1.25, reverse: false, speed: 0.78,
    options: { coat: LOOK.palette.oatmeal, scale: 0.82, seed: 5 } },
  { id: 'hound', kind: 'quadruped', path: 1, offset: -1.35, reverse: true, speed: 1.45,
    options: { coat: LOOK.palette.wool, scale: 0.72, seed: 19 } }
];

/**
 * @returns {{group: THREE.Group, walkers: object[], animate: (dt: number) => boolean}}
 */
export function createCreatures({ plan, heightAt, THREE }) {
  const group = new THREE.Group();
  const walkers = [];
  for (const member of CAST) {
    const path = plan.paths[member.path] ?? plan.paths[0];
    const route = routeFromPath(path, member);
    if (route.length < 2) continue;
    const walker = member.kind === 'biped'
      ? biped({ speed: member.speed, ...member.options })
      : quadruped({ speed: member.speed, ...member.options });
    walker.setRoute(route, true);                 // loop: the walker patrols back along the lane
    group.add(walker.group);
    walkers.push({ id: member.id, walker });
  }
  // Stagger the start so four walkers do not march in lockstep down the same lane.
  walkers.forEach((entry, index) => {
    for (let i = 0; i < index * 90; i++) entry.walker.animate(1 / 60);
  });
  return {
    group, walkers,
    animate(dt) {
      if (!(dt > 0)) return false;
      for (const { walker } of walkers) {
        walker.animate(dt);
        const [x, , z] = walker.state.position;
        walker.group.position.y = heightAt(x, z);   // the lane rolls; the feet follow it
      }
      return walkers.length > 0;
    }
  };
}
