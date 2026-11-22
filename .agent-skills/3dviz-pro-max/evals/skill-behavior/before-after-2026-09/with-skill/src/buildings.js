// buildings.js - places every record in BUILDINGS on the terraced ground. The floor sits part way
// up the footprint's height range, so the uphill wall cuts into the terrace and a stone plinth
// fills the downhill gap: founded on the slope, never floating. Returns the records that
// selection.js and main.js read.
import * as THREE from 'three';
import { BUILDINGS } from './village-model.js';
import { PROGRAMS } from './building-programs.js';
import { plinth } from './building-kit.js';
import { heightAt } from './terrain.js';

const UP = new THREE.Vector3(0, 1, 0);
const MAX_PLINTH = 2.4;
const BED_INTO_SLOPE = 0.62; // floor sits 62% up the footprint's height range, so walls cut in

function footprintHeights(building) {
  const [width, depth] = building.footprint;
  const corner = new THREE.Vector3();
  let high = -Infinity, low = Infinity;
  for (const sx of [-0.5, 0, 0.5]) for (const sz of [-0.5, 0, 0.5]) {
    corner.set(sx * width, 0, sz * depth).applyAxisAngle(UP, building.rotation);
    const y = heightAt(building.x + corner.x, building.z + corner.z);
    high = Math.max(high, y);
    low = Math.min(low, y);
  }
  return { high, low };
}

/**
 * @returns {{records: Array, group: THREE.Group}} records carry the model row, the world anchor
 * and the radius the camera should stop at, so selection and framing never re-derive geometry.
 */
export function createBuildings({ mats }) {
  const group = new THREE.Group();
  const records = [];
  for (const building of BUILDINGS) {
    const shell = new THREE.Group();
    const { high, low } = footprintHeights(building);
    const floor = low + (high - low) * BED_INTO_SLOPE;
    shell.position.set(building.x, floor, building.z);
    shell.rotation.y = building.rotation;
    shell.userData.buildingId = building.id;
    if (!building.landmark) {
      plinth(shell, {
        width: building.footprint[0], depth: building.footprint[1],
        drop: Math.min(floor - low, MAX_PLINTH), stone: mats.stone
      });
    }
    PROGRAMS[building.kind](shell, mats);
    group.add(shell);
    records.push({
      id: building.id,
      data: building,
      object: shell,
      anchor: new THREE.Vector3(building.x, floor, building.z),
      radius: building.selectRadius
    });
  }
  return { group, records };
}
