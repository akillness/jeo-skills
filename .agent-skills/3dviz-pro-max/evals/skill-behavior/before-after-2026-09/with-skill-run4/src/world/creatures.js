// creatures.js - the village's moving inhabitants: two figures walking the lanes and two animals
// on the west pasture, both from the walker kits. The gait is procedural - animate() advances the
// phase by distance travelled over stride length - so a planted foot holds its world position.
// Each walker sits in a holder whose y is resampled from the height field every frame, which is
// how a route drawn in plan follows rolling ground.
import { THREE } from '../kits/kit-core.js';
import { create as biped } from '../kits/creatures/biped-walker.js';
import { create as quadruped } from '../kits/creatures/quadruped-walker.js';

const ROUTES = [
  { kind: 'biped', speed: 1.15, seed: 2, tunic: '#7a6f9c',
    points: [[-19.6, 4.4], [-13.2, 2.6], [-7.4, 1.2], [-2.2, 0.5], [1.8, 0.2], [-2.2, 0.5],
             [-7.4, 1.2], [-13.2, 2.6]] },
  { kind: 'biped', speed: 0.92, seed: 6, tunic: '#8d5f4c',
    points: [[-3.4, 3.4], [-6.4, -0.6], [-6.2, -5.2], [-3.0, -8.4], [0.2, -6.4], [0.0, -1.8],
             [-1.6, 2.4]] },
  { kind: 'quadruped', speed: 0.72, seed: 4,
    points: [[-21.5, 2.4], [-17.0, 1.4], [-12.6, 3.4], [-17.4, 5.4]] },
  { kind: 'quadruped', speed: 0.63, seed: 9,
    points: [[-19.4, 5.2], [-15.0, 3.6], [-11.6, 4.4], [-16.6, 6.0]] }
];

export function createCreatures(heightAt) {
  const group = new THREE.Group();
  const walkers = ROUTES.map(route => {
    const kit = route.kind === 'biped'
      ? biped({ seed: route.seed, speed: route.speed, tunic: route.tunic, scale: 1 })
      : quadruped({ seed: route.seed, speed: route.speed, scale: 0.95 });
    kit.setRoute(route.points, true);
    const holder = new THREE.Group();
    holder.add(kit.group);
    group.add(holder);
    return { kit, holder };
  });
  const settle = () => {
    for (const { kit, holder } of walkers) {
      holder.position.y = heightAt(kit.state.position[0], kit.state.position[2]);
    }
  };
  settle();
  return {
    group, walkers,
    /** @returns {boolean} true while any walker moved, so the demand-driven loop keeps drawing. */
    animate(dt) {
      if (dt <= 0) return false;
      let moved = false;
      for (const { kit } of walkers) moved = kit.animate(dt) || moved;
      settle();
      return moved;
    },
    /** Where the camera should look to follow a walker. */
    positionOf(index) {
      const { kit, holder } = walkers[index];
      return [kit.state.position[0], holder.position.y + 1.0, kit.state.position[2]];
    }
  };
}
