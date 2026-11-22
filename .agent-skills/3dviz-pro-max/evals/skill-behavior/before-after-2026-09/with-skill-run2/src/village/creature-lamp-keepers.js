// creature-lamp-keepers.js - the two people who own the light in this village. They walk an
// authored terrain-aware route, pause at waypoints, and carry a real PointLight, so the pool of
// light moves with them. Change SPEED and the pause list first.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

const SPEED = 1.05;        // m/s, an unhurried walk
const PAUSE_S = [1.6, 2.4]; // hold at a waypoint - the style record's 500 ms hold, lengthened for a person
const HEIGHT = 1.72;       // m, the stated human scale cue

function buildKeeper(materials, cloakColor) {
  const group = new THREE.Group();
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 9, 1),
    new THREE.MeshStandardMaterial({ color: cloakColor, roughness: 0.9 }));
  cloak.position.y = 1.02; cloak.castShadow = true; group.add(cloak);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), materials.skin);
  head.position.y = 1.62; head.castShadow = true; group.add(head);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.34, 9, 1), cloak.material);
  hood.position.y = 1.74; group.add(hood);
  const legGeometry = new THREE.CapsuleGeometry(0.075, 0.4, 3, 7);
  const legs = [-1, 1].map(side => {
    const leg = new THREE.Mesh(legGeometry, materials.timber);
    leg.position.set(side * 0.13, 0.3, 0); leg.castShadow = true; group.add(leg);
    return leg;
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 1.5, 5), materials.timber);
  pole.position.set(0.3, 1.15, 0.06); pole.rotation.z = -0.22; group.add(pole);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 5, 10, Math.PI), materials.timber);
  hook.position.set(0.46, 1.85, 0.06); group.add(hook);
  return { group, legs };
}

/**
 * @param {object} materials
 * @param {Array<{path: number[][], color: string, lantern: THREE.Object3D|null, offset: number}>} routes
 * @returns {{group, lights, update(time, dt), dispose()}}
 */
export function createLampKeepers(materials, routes) {
  const group = new THREE.Group();
  const lights = [];
  const keepers = routes.map((route, index) => {
    const { group: body, legs } = buildKeeper(materials, route.color);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), materials.lanternPaper);
    glow.position.set(0.52, 1.72, 0.06);
    body.add(glow);
    const light = new THREE.PointLight('#ffb46b', 26, 0, 2);   // 26 cd: a carried lamp, not a street lantern
    light.position.set(0.52, 1.72, 0.06);
    body.add(light);
    lights.push(light);
    group.add(body);
    return {
      body, legs, route: route.path, leg: 0, t: route.offset ?? 0, wait: 0,
      pace: 0.85 + index * 0.22, heading: 0
    };
  });

  function sample(route, leg, t) {
    const a = route[leg % route.length], b = route[(leg + 1) % route.length];
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    return [x, heightAt(x, z), z, Math.atan2(b[0] - a[0], b[1] - a[1])];
  }

  return {
    group, lights,
    update(time, dt) {
      for (const keeper of keepers) {
        if (keeper.wait > 0) { keeper.wait -= dt; }
        else {
          const a = keeper.route[keeper.leg % keeper.route.length];
          const b = keeper.route[(keeper.leg + 1) % keeper.route.length];
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          keeper.t += (SPEED * keeper.pace * dt) / length;
          if (keeper.t >= 1) {
            keeper.t = 0; keeper.leg++;
            if (keeper.leg % 3 === 0) keeper.wait = PAUSE_S[keeper.leg % 2];
          }
        }
        const [x, y, z, heading] = sample(keeper.route, keeper.leg, keeper.t);
        keeper.body.position.set(x, y, z);
        // Turn toward the new heading instead of snapping: a person does not pivot on the spot.
        let delta = heading - keeper.heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        keeper.heading += delta * Math.min(1, dt * 3.2);
        keeper.body.rotation.y = keeper.heading;
        const stride = keeper.wait > 0 ? 0 : Math.sin(time * 5.4 * keeper.pace) * 0.32;
        keeper.legs[0].rotation.x = stride;
        keeper.legs[1].rotation.x = -stride;
        keeper.body.position.y = y + Math.abs(Math.sin(time * 5.4 * keeper.pace)) * 0.03;
      }
    },
    dispose() {
      group.traverse(object => { object.geometry?.dispose(); object.material?.dispose?.(); });
    }
  };
}

export const KEEPER_HEIGHT = HEIGHT;
