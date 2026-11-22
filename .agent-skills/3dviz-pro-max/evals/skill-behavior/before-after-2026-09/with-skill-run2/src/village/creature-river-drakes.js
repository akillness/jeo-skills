// creature-river-drakes.js - two serpentine river drakes patrol the Slowwater. Each is a chain of
// segments that follow the same path with a lag, which is what makes a body look like it swims
// rather than slides. Change LENGTHS and the undulation frequency first.
import * as THREE from 'three';
import { riverCenter, WATER_Y } from './terrain.js';

const SEGMENTS = 8;
const SEGMENT_GAP = 0.62;   // m between segment centres; body reads about 5 m nose to tail

/** Path along the channel: the drake swims the meander, not a straight line. */
function pathPoint(s, lane) {
  const x = ((s % 84) + 84) % 84 - 42;
  return { x, z: riverCenter(x) + lane * Math.sin(s * 0.09) * 2.4 + lane * 1.6 };
}

/**
 * @param {object} materials
 * @param {Array<{lane: number, speed: number, phase: number, tint: string}>} specs
 * @returns {{group, update(time, dt), dispose()}}
 */
export function createRiverDrakes(materials, specs) {
  const group = new THREE.Group();
  const bead = new THREE.SphereGeometry(0.42, 12, 9);
  const fin = new THREE.ConeGeometry(0.3, 0.9, 4, 1);
  const drakes = specs.map(spec => {
    const skin = new THREE.MeshStandardMaterial({ color: spec.tint, roughness: 0.35, metalness: 0.05 });
    const body = new THREE.Group();
    const beads = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const mesh = new THREE.Mesh(bead, skin);
      const taper = 1 - (i / SEGMENTS) * 0.62;
      mesh.scale.set(taper, taper * 0.82, taper);
      mesh.castShadow = true;
      body.add(mesh); beads.push(mesh);
    }
    const crest = new THREE.Mesh(fin, materials.lanternPaper);   // the one emissive part: a lure
    crest.position.set(0, 0.42, 0); crest.scale.setScalar(0.5);
    beads[0].add(crest);
    const tail = new THREE.Mesh(fin, skin);
    tail.rotation.x = Math.PI / 2; tail.scale.set(0.8, 1.3, 0.5);
    beads[SEGMENTS - 1].add(tail);
    group.add(body);
    return { beads, spec, s: spec.phase, skin };
  });

  return {
    group,
    update(time, dt) {
      for (const drake of drakes) {
        // Vary speed with a slow sine: a fish that holds one speed reads as a conveyor belt.
        const speed = drake.spec.speed * (0.75 + 0.35 * Math.sin(time * 0.23 + drake.spec.phase));
        drake.s += speed * dt;
        for (let i = 0; i < drake.beads.length; i++) {
          const point = pathPoint(drake.s - i * SEGMENT_GAP, drake.spec.lane);
          const wave = Math.sin(time * 1.9 - i * 0.75 + drake.spec.phase);
          const dive = Math.sin(time * 0.31 + drake.spec.phase) * 0.55;
          const bead2 = drake.beads[i];
          bead2.position.set(point.x, WATER_Y + 0.05 + dive - i * 0.055 + wave * 0.06, point.z + wave * 0.55);
          bead2.rotation.y = Math.cos(time * 1.9 - i * 0.75 + drake.spec.phase) * 0.35;
        }
      }
    },
    dispose() {
      bead.dispose(); fin.dispose();
      for (const drake of drakes) drake.skin.dispose();
    }
  };
}
