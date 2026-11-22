// lanterns.js - paper lanterns hung on the rig's practicals. The rig owns the PointLights (first
// ten only; the rest are emissive-only, which is what keeps the shader under its light limit);
// this file owns the 0.35 m paper shell, the pole, the sway and the reflection on the water.
import * as THREE from 'three';
import { riverCenter } from './terrain.js';

const SWAY_PERIOD = [3.2, 4.8];   // s, from knowledge.style-lantern-festival-riverside
const SWAY_DEG = 3;
const SHELL_DROP = 0.34;          // m below the hang point, where the light sits

/**
 * @param {THREE.Scene} scene
 * @param {{createLantern: (p: number[]) => {mesh: THREE.Mesh, light: THREE.PointLight|null}}} rig
 * @param {Array<{x: number, y: number, z: number, pole: boolean}>} points
 * @param {object} materials
 * @param {{addReflection: Function}} water
 * @returns {{group, update(time), dispose()}}
 */
export function createLanterns(scene, rig, points, materials, water) {
  const group = new THREE.Group();
  const shell = new THREE.SphereGeometry(0.175, 14, 10);
  const cap = new THREE.CylinderGeometry(0.07, 0.09, 0.07, 8);
  const cord = new THREE.CylinderGeometry(0.012, 0.012, SHELL_DROP, 4);
  const poleGeometry = new THREE.CylinderGeometry(0.07, 0.1, 1, 6);
  const pivots = [];

  points.forEach((point, index) => {
    const pivot = new THREE.Group();
    pivot.position.set(point.x, point.y, point.z);
    group.add(pivot);

    const { mesh, light } = rig.createLantern([point.x, 0, point.z]);
    pivot.add(mesh);                       // the rig's core sphere becomes the flame inside the paper
    mesh.position.set(0, -SHELL_DROP, 0);
    if (light) {
      light.position.set(point.x, point.y - SHELL_DROP, point.z);
      // A point may ask for its own candela: the beacon is a navigation light, not a house lantern.
      if (point.intensity) { light.intensity = point.intensity; light.distance = 34; }
    }

    const paper = new THREE.Mesh(shell, materials.lanternPaper);
    paper.position.y = -SHELL_DROP;
    const bigger = point.intensity ? 1.9 : 1;      // the beacon lamp is visibly a bigger lamp
    paper.scale.set(bigger, 1.16 * bigger, bigger);
    pivot.add(paper);
    const top = new THREE.Mesh(cap, materials.timber);
    top.position.y = -SHELL_DROP + 0.2; pivot.add(top);
    const string = new THREE.Mesh(cord, materials.timber);
    string.position.y = -SHELL_DROP / 2; pivot.add(string);

    if (point.pole) {
      const post = new THREE.Mesh(poleGeometry, materials.timber);
      post.scale.y = point.y;                       // pole runs from the ground up to the hang point
      post.position.set(point.x, point.y / 2, point.z);
      post.castShadow = true;
      group.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.09), materials.timber);
      arm.position.set(point.x - 0.22, point.y + 0.02, point.z);
      group.add(arm);
      pivot.position.x -= 0.44;
    }
    // Every lantern within sight of the water appears twice: the signature move of this look.
    const overWater = Math.abs(point.z - riverCenter(point.x)) < 13;
    if (overWater) {
      const reach = THREE.MathUtils.clamp(point.y, 2, 14);
      water.addReflection(point.x, riverCenter(point.x) + (point.z - riverCenter(point.x)) * 0.45,
        '#f2b25c', 0.9 + reach * 0.06, 3.2 + reach * 0.5);
    }
    pivots.push({
      pivot,
      period: SWAY_PERIOD[0] + (index % 5) / 4 * (SWAY_PERIOD[1] - SWAY_PERIOD[0]),
      phase: point.x * 0.37 + index
    });
  });

  const amplitude = THREE.MathUtils.degToRad(SWAY_DEG);
  return {
    group,
    /** Sway is phase-offset by x so the street never swings as one object. */
    update(time) {
      for (const { pivot, period, phase } of pivots) {
        pivot.rotation.z = Math.sin((time / period) * Math.PI * 2 + phase) * amplitude;
        pivot.rotation.x = Math.sin((time / (period * 1.31)) * Math.PI * 2 + phase * 0.7) * amplitude * 0.7;
      }
    },
    dispose() { shell.dispose(); cap.dispose(); cord.dispose(); poleGeometry.dispose(); }
  };
}
